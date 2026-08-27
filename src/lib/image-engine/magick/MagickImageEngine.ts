/**
 * Implementacao de ImageEngine sobre @imagemagick/magick-wasm.
 *
 * ESTE E O UNICO FICHEIRO DA APLICACAO QUE IMPORTA magick-wasm.
 * Um script de verificacao confirma que o motor nao aparece em nenhum bundle
 * da main thread.
 *
 * Notas de API, todas verificadas contra a versao 0.0.42 e nao lidas na
 * documentacao:
 *
 *  - `interlace` e apenas leitura na imagem. O JPEG progressivo obtem-se com
 *    `img.settings.interlace`, confirmado pelo marcador SOF 0xFFC2 no output.
 *  - `setDefine` vive em `img.settings`, nao em `img`.
 *  - `write` com um formato invalido NAO lanca. Cai na sobrecarga que grava no
 *    formato de origem e devolve um ficheiro valido no formato errado. E o pior
 *    tipo de falha possivel aqui, por isso `comoMagickFormat` valida antes.
 *  - `collection.ping(bytes)` le cabecalhos sem descodificar pixels e da
 *    dimensoes, formato, alfa e numero de frames. E o que sustenta `inspect`.
 *  - `MagickGeometry.greater = true` significa "so reduzir", e
 *    `ignoreAspectRatio = true` significa dimensoes exatas. Por defeito a
 *    proporcao e preservada, que e o comportamento que queremos.
 *  - `strip()` apaga TODOS os perfis, incluindo o ICC. Preservar a cor exige
 *    ler o perfil antes, apagar, e reanexar.
 *  - o objeto devolvido por `getProfile` NAO sobrevive ao `strip()`. Guarda-lo
 *    e usa-lo depois lanca ColorspaceColorProfileMismatch, de forma
 *    dependente do estado do heap: em isolamento passa, depois de uma imagem
 *    grande ter sido descodificada falha. Os bytes tem de ser copiados de
 *    imediato.
 *  - o motor ACRESCENTA atributos `date:*` com a hora atual, e o escritor de
 *    PNG grava-os em chunks tEXt. Nao sao metadados do utilizador, sao
 *    carimbos do momento da conversao, e tem de sair mesmo quando a politica
 *    e manter tudo.
 *  - `ImageMagick.read` de um ficheiro com varios frames devolve UM frame e
 *    nao avisa. Num GIF animado isso destroi a animacao em silencio, que e
 *    exatamente o que o CLAUDE.md, seccao 5.8, proibe. Por isso a conversao
 *    passa toda pela colecao. Medido: para um ficheiro de um frame, a colecao
 *    produz bytes identicos ao caminho de imagem unica, no mesmo tempo
 *    (JPEG 800x600 para WebP: 51 164 bytes nos dois casos, 196 ms contra
 *    206 ms). Nao ha dois caminhos a manter.
 *  - num ICO com varios tamanhos, `ImageMagick.read` escolhe o PRIMEIRO frame.
 *    Medido: um ICO com 16, 48 e 256 px devolvia 16x16. A colecao permite
 *    escolher o maior, que e o que o utilizador quer.
 *  - `collection.coalesce()` transforma frames parciais em frames completos,
 *    compondo cada um sobre a geometria de canvas do frame 0. Obrigatorio
 *    antes de redimensionar UMA ANIMACAO: um GIF otimizado guarda frames de
 *    50x50 com deslocamento, e redimensionar cada um separadamente parte a
 *    animacao. NAO se aplica a ICO ('tamanhos') nem TIFF ('paginas'): ai cada
 *    frame e uma imagem completa e independente, com o seu proprio tamanho, e
 *    coalesce forcava todas ao tamanho da primeira. Bug real neste ficheiro,
 *    apanhado por tests/unit/tiff-ico.test.ts a medir dimensoes por frame em
 *    vez de so contar frames.
 *  - `collection.optimize()` volta a reduzir os frames as regioes que mudam.
 *    Medido: com 8 frames iguais, 523 089 bytes passaram a 66 290. Com frames
 *    genuinamente diferentes o ganho e nulo, porque nao ha nada repetido para
 *    remover. Nunca aumentou.
 */
import {
  DitherMethod,
  initializeImageMagick,
  Interlace,
  Magick,
  MagickFormat,
  MagickGeometry,
  MagickImageCollection,
  MagickReadSettings,
  QuantizeSettings,
  type IMagickImage,
  type IMagickImageCollection,
} from '@imagemagick/magick-wasm'

import { PROFUNDIDADE_DE_CANAL } from '@/config/engine'
import {
  formatoPorId,
  formatoPorMagickFormat,
  type ImageFormatCapability,
} from '@/config/formats'
import type { ConversionOptions, ImageInspection } from '@/features/converter/types'
import type {
  EngineCapabilities,
  EngineConversion,
  EngineThumbnail,
  FormatHint,
  ImageEngine,
} from '../ImageEngine'
import { resolveEncodeDirectives, type EncodeDirectives } from '../options'

/**
 * Formato e qualidade da miniatura.
 *
 * WebP porque todos os browsers alvo o descodificam e porque um WebP de 720 px
 * a qualidade 80 fica na ordem das dezenas de KB, contra centenas em PNG.
 */
const FORMATO_DA_MINIATURA = 'webp' as const
const QUALIDADE_DA_MINIATURA = 80

/** Nomes que este binario reconhece de facto, lidos da propria biblioteca. */
const FORMATOS_DO_MOTOR: ReadonlySet<string> = new Set(Object.values(MagickFormat))

/**
 * Converte um nome do registry num formato do motor, validando primeiro.
 *
 * A validacao nao e defensiva por habito, e a resposta a um comportamento
 * verificado: `MagickFormat.Jfif` nao existe nesta versao, e `write(undefined)`
 * nao lanca. Grava no formato de origem e devolve bytes validos do formato
 * errado. Um utilizador receberia um `.jfif` que era na verdade um PNG, sem
 * qualquer erro. Aqui isso passa a ser uma excecao imediata.
 */
function comoMagickFormat(nome: string): MagickFormat {
  if (!nome || !FORMATOS_DO_MOTOR.has(nome)) {
    throw new Error(`NoEncodeDelegateForThisImageFormat: formato invalido "${String(nome)}"`)
  }
  return nome as MagickFormat
}

/**
 * Le uma colecao, declarando o formato quando o chamador o conhece.
 *
 * `ping` le apenas cabecalhos e `read` descodifica os pixels. Os dois precisam
 * do mesmo tratamento do hint, e ter isto num sitio evita que um dos tres
 * caminhos do motor se esqueca dele. Ja aconteceu na camada acima.
 */
function abrir(
  colecao: IMagickImageCollection,
  input: ArrayBuffer,
  hint: FormatHint,
  modo: 'ping' | 'read',
): void {
  const bytes = new Uint8Array(input)
  const settings = hint.magickFormat
    ? new MagickReadSettings({ format: comoMagickFormat(hint.magickFormat) })
    : null

  if (modo === 'ping') {
    if (settings) colecao.ping(bytes, settings)
    else colecao.ping(bytes)
    return
  }

  if (settings) colecao.read(bytes, settings)
  else colecao.read(bytes)
}

export class MagickImageEngine implements ImageEngine {
  #pronto = false

  /**
   * Arranca o motor a partir de um URL ou de bytes.
   *
   * O worker passa um URL e deixa o magick-wasm buscar o binario. Os testes em
   * Node passam os bytes, porque nao existe `self.location` fora do browser.
   * Aceitar as duas formas permite testar este adaptador pela porta real, em
   * vez de chamar a biblioteca por fora e verificar outra coisa.
   */
  async initialize(fonte: string | Uint8Array): Promise<void> {
    if (this.#pronto) return
    await initializeImageMagick(
      typeof fonte === 'string' ? new URL(fonte, self.location.origin) : fonte,
    )
    this.#pronto = true
  }

  async getCapabilities(): Promise<EngineCapabilities> {
    this.#assertPronto()
    return {
      engineVersion: Magick.imageMagickVersion,
      delegates: Magick.delegates.split(/\s+/).filter(Boolean),
      channelDepth: PROFUNDIDADE_DE_CANAL,
    }
  }

  async inspect(input: ArrayBuffer, hint: FormatHint): Promise<ImageInspection> {
    this.#assertPronto()
    const colecao = MagickImageCollection.create()
    try {
      // ping le cabecalhos. Nao descodifica pixels, logo e barato mesmo a 24 MP.
      abrir(colecao, input, hint, 'ping')

      const primeiro = colecao[0]
      if (!primeiro) throw new Error('ImproperImageHeader: nenhuma imagem no ficheiro')

      const magickFormat = String(primeiro.format)
      const formato = formatoPorMagickFormat(magickFormat)

      // As dimensoes reportadas tem de ser as do frame que a conversao vai
      // usar, senao a interface promete um tamanho e entrega outro. Num ICO com
      // 16, 48 e 256 px, o primeiro frame e o de 16 e o convertido e o de 256.
      const escolhido = escolherFrame(colecao, formato)

      return {
        formatId: formato?.id ?? null,
        magickFormat,
        width: escolhido.width,
        height: escolhido.height,
        frameCount: colecao.length,
        hasAlpha: escolhido.hasAlpha,
      }
    } finally {
      colecao.dispose()
    }
  }

  async convert(
    input: ArrayBuffer,
    options: ConversionOptions,
    hint: FormatHint = { magickFormat: null },
  ): Promise<EngineConversion> {
    this.#assertPronto()
    const diretivas = resolveEncodeDirectives(options)
    const destino = formatoPorId(options.outputFormat)

    const inicio = performance.now()
    const colecao = MagickImageCollection.create()

    try {
      // O hint existe para formatos de magic bytes fracos. Medido: um ICO sem
      // formato explicito lanca NoDecodeDelegateForThisImageFormat.
      abrir(colecao, input, hint, 'read')

      const fimDoDecode = performance.now()

      const primeiro = colecao[0]
      if (!primeiro) throw new Error('ImproperImageHeader: nenhuma imagem no ficheiro')

      const framesDeEntrada = colecao.length
      const origem = formatoPorMagickFormat(String(primeiro.format))

      const codificado = devePreservarFrames(framesDeEntrada, origem, destino)
        ? escreverTodosOsFrames(colecao, diretivas, destino)
        : escreverUmFrame(colecao, origem, diretivas)

      const fim = performance.now()

      return {
        bytes: codificado.bytes,
        width: codificado.width,
        height: codificado.height,
        formatId: destino.id,
        durationMs: Math.round(fim - inicio),
        decodeMs: Math.round(fimDoDecode - inicio),
        encodeMs: Math.round(fim - fimDoDecode),
        profilesKept: codificado.profilesKept,
        frameCount: framesDeEntrada,
        outputFrameCount: codificado.frames,
      }
    } finally {
      colecao.dispose()
    }
  }

  /**
   * Miniatura para os formatos que o browser nao descodifica.
   *
   * Nao e uma conversao com outro nome: nao ha politica de metadados a
   * respeitar nem qualidade a escolher, porque o ficheiro nunca chega ao
   * utilizador. Sai sempre sem metadados e em WebP, que qualquer browser alvo
   * descodifica. Medido: 31 ms para um TIFF de 320x200.
   */
  async thumbnail(
    input: ArrayBuffer,
    hint: FormatHint,
    larguraMaxima: number,
  ): Promise<EngineThumbnail> {
    this.#assertPronto()
    const inicio = performance.now()
    const colecao = MagickImageCollection.create()

    try {
      abrir(colecao, input, hint, 'read')

      const primeiro = colecao[0]
      if (!primeiro) throw new Error('ImproperImageHeader: nenhuma imagem no ficheiro')

      // O mesmo frame que a conversao vai usar, senao a pre-visualizacao
      // mostra uma imagem e o resultado e outra.
      const frame = escolherFrame(colecao, formatoPorMagickFormat(String(primeiro.format)))

      frame.autoOrient()
      // Uma miniatura nao leva metadados: nao vai para lado nenhum e o perfil
      // de cor nao compensa os bytes num objeto de 720 px de largura.
      frame.strip()

      const geo = new MagickGeometry(larguraMaxima, larguraMaxima)
      // Nunca aumentar: uma miniatura esticada nao ajuda ninguem.
      geo.greater = true
      frame.resize(geo)
      frame.quality = QUALIDADE_DA_MINIATURA

      const destino = formatoPorId(FORMATO_DA_MINIATURA)
      const bytes = frame.write(comoMagickFormat(destino.magickFormat), (d) => d.slice())

      return {
        bytes,
        width: frame.width,
        height: frame.height,
        formatId: destino.id,
        durationMs: Math.round(performance.now() - inicio),
      }
    } finally {
      colecao.dispose()
    }
  }

  dispose(): void {
    // O binario WASM nao se descarrega. Libertar memoria implica terminar o
    // worker inteiro, que e o que o cliente faz na reciclagem e no cancelamento.
    this.#pronto = false
  }

  #assertPronto(): void {
    if (!this.#pronto) throw new Error('Motor nao inicializado')
  }
}

type Codificado = {
  readonly bytes: Uint8Array
  readonly width: number
  readonly height: number
  readonly profilesKept: string[]
  /** Frames que o ficheiro de saida tem. */
  readonly frames: number
}

/** Saida com todos os frames, para animacao, paginas ou tamanhos preservados. */
function escreverTodosOsFrames(
  colecao: IMagickImageCollection,
  diretivas: EncodeDirectives,
  destino: ImageFormatCapability,
): Codificado {
  // Frames parciais viram frames completos antes de qualquer geometria: um GIF
  // otimizado guarda regioes com deslocamento, e redimensionar cada uma em
  // separado parte a animacao. So faz sentido para animacao: coalesce compoe
  // cada frame sobre a geometria de canvas do frame 0, que e exatamente o que
  // uma animacao precisa mas um ICO ('tamanhos') ou um TIFF ('paginas') nao
  // pode ter — cada frame ai e uma imagem completa e independente, com o seu
  // proprio tamanho, e coalesce forcaria todas ao tamanho da primeira.
  if (destino.multiFrame === 'animacao') colecao.coalesce()

  const perfis: string[][] = []
  for (const frame of colecao) perfis.push(aplicarDiretivas(frame, diretivas))

  // Apenas em GIF: e uma otimizacao do formato GIF, que substitui cada frame
  // pela regiao que mudou. Medido, no WebP nao muda nada (34 104 bytes com e
  // sem), porque o WebP ja faz predicao entre frames por dentro. Aplica-la ali
  // seria um passo especulativo.
  if (destino.id === 'gif') colecao.optimize()

  const bytes = colecao.write(comoMagickFormat(diretivas.magickFormat), (d) => d.slice())
  const cabeca = colecao[0]
  if (!cabeca) throw new Error('ImproperImageHeader: colecao vazia')

  return {
    bytes,
    width: cabeca.width,
    height: cabeca.height,
    // A politica de metadados e a mesma em todos os frames, portanto os perfis
    // do primeiro descrevem o ficheiro.
    profilesKept: perfis[0] ?? [],
    frames: colecao.length,
  }
}

/** Saida de um frame so, quando o destino guarda uma imagem apenas. */
function escreverUmFrame(
  colecao: IMagickImageCollection,
  origem: ImageFormatCapability | null,
  diretivas: EncodeDirectives,
): Codificado {
  const frame = escolherFrame(colecao, origem)
  const profilesKept = aplicarDiretivas(frame, diretivas)

  return {
    bytes: frame.write(comoMagickFormat(diretivas.magickFormat), (d) => d.slice()),
    width: frame.width,
    height: frame.height,
    profilesKept,
    frames: 1,
  }
}

/**
 * Preservar varios frames so faz sentido quando os dois lados querem dizer a
 * mesma coisa com eles.
 *
 * Um GIF animado gravado como ICO daria um icone com N copias da mesma
 * dimensao, e um ICO de tres tamanhos gravado como GIF daria uma animacao de
 * tres frames de tamanhos diferentes. Nos dois casos o resultado e lixo, e o
 * que o utilizador quer e uma imagem so.
 */
function devePreservarFrames(
  frames: number,
  origem: ImageFormatCapability | null,
  destino: ImageFormatCapability,
): boolean {
  if (frames <= 1) return false
  if (destino.multiFrame === 'nenhum') return false
  return origem?.multiFrame === destino.multiFrame
}

/**
 * Que frame sobrevive quando o destino guarda uma imagem so.
 *
 * Num ICO os frames sao tamanhos do mesmo icone, portanto o maior e o unico
 * que interessa: manter o primeiro daria os 16x16 de um ficheiro que tambem
 * tinha 256x256. Numa animacao ou num documento de varias paginas, o primeiro
 * frame e a resposta certa.
 */
function escolherFrame(
  colecao: IMagickImageCollection,
  origem: ImageFormatCapability | null,
): IMagickImage {
  const primeiro = colecao[0]
  if (!primeiro) throw new Error('ImproperImageHeader: nenhuma imagem no ficheiro')
  if (origem?.multiFrame !== 'tamanhos') return primeiro

  let maior = primeiro
  for (const frame of colecao) {
    if (frame.width * frame.height > maior.width * maior.height) maior = frame
  }
  return maior
}

/**
 * Atributos de data que o proprio motor acrescenta a imagem.
 *
 * Nao vem do ficheiro do utilizador: sao gerados no momento da leitura, com a
 * hora atual. O escritor de PNG grava-os em chunks tEXt, verificado:
 *
 *   tEXt = date:modify|2026-08-21T13:37:11+00:00
 *   tEXt = date:timestamp|2026-08-21T13:37:11+00:00
 *
 * Isto significa que "manter os metadados" acrescentaria ao ficheiro uma data
 * que o original nao tinha, revelando quando o utilizador fez a conversao. E o
 * oposto de preservar. Por isso saem sempre, em qualquer politica.
 *
 * Efeito secundario util: a saida passa a ser reprodutivel byte a byte.
 */
const CARIMBOS_DO_MOTOR = ['date:create', 'date:modify', 'date:timestamp'] as const

function removerCarimbosDoMotor(img: IMagickImage): void {
  for (const nome of CARIMBOS_DO_MOTOR) img.removeAttribute(nome)
}

/** Copia os bytes de um perfil, para sobreviverem a um strip. */
function copiarPerfil(img: IMagickImage, nome: string): Uint8Array | null {
  const perfil = img.getProfile(nome)
  if (!perfil) return null
  return new Uint8Array(perfil.data)
}

/** Devolve os nomes dos perfis que ficaram na imagem depois de aplicar a politica. */
function aplicarDiretivas(img: IMagickImage, d: EncodeDirectives): string[] {
  // Ordem obrigatoria: a orientacao tem de ser aplicada aos pixels antes de o
  // EXIF ser removido, senao a imagem sai deitada. CLAUDE.md, seccao 23.
  if (d.autoOrient) img.autoOrient()

  // Sai sempre, mesmo com a politica de manter tudo: nao e metadado do
  // utilizador, e a hora a que esta conversao aconteceu.
  removerCarimbosDoMotor(img)

  if (d.metadata.strip) {
    // `strip` apaga tudo, incluindo o perfil de cor. Copiamos os bytes do ICC
    // antes, para os poder devolver quando a politica e preservar a aparencia.
    //
    // A copia e obrigatoria e nao uma precaucao: o objeto devolvido por
    // getProfile e uma vista sobre a memoria da imagem e deixa de ser valido
    // depois do strip. Reutiliza-lo lanca ColorspaceColorProfileMismatch
    // quando o heap ja cresceu com uma imagem grande.
    const icc = d.metadata.preserveColorProfile ? copiarPerfil(img, 'icc') : null

    img.strip()

    if (icc) img.setProfile('icc', icc)
  }

  if (d.resize) {
    const geo = new MagickGeometry(d.resize.width, d.resize.height)
    geo.ignoreAspectRatio = d.resize.ignoreAspectRatio
    geo.greater = d.resize.onlyShrink
    img.resize(geo)
  }

  // Depois do resize, nunca antes: redimensionar interpola e volta a inventar
  // cores, o que desfazia o ganho da quantizacao.
  //
  // Com difusao de erro (Floyd-Steinberg) e nao sem: sem difusao o ficheiro
  // fica menor (medido, 74 % contra 68 %) mas aparecem faixas visiveis em
  // gradientes e ceus. 68 % com a imagem apresentavel vale mais do que 74 %
  // com bandas, e e tambem o compromisso que o TinyPNG faz.
  if (d.palette !== null) {
    const q = new QuantizeSettings()
    q.colors = d.palette
    q.ditherMethod = DitherMethod.FloydSteinberg
    img.quantize(q)
  }

  if (d.quality !== null) img.quality = d.quality
  if (d.interlace) img.settings.interlace = Interlace.Plane

  for (const define of d.defines) {
    img.settings.setDefine(comoMagickFormat(define.format), define.name, define.value)
  }

  return [...img.profileNames]
}
