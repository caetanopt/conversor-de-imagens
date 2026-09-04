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
 *  - `floodFill(alphaNumerico, x, y)` NAO faz nada. A sobrecarga existe na
 *    assinatura, aceita a chamada, nao lanca, e o canal alfa fica intacto:
 *    medido 0,0 % de pixeis transparentes em quatro cantos de um fundo branco
 *    puro. A sobrecarga que funciona e a que recebe uma MagickColor
 *    transparente, com a qual a mesma imagem da 78,7 %. Outro caso do mesmo
 *    padrao do `write` com formato invalido: a API aceita e mente.
 *  - `crop` deixa a GEOMETRIA DE PAGINA por corrigir, e ela vai para o ficheiro.
 *    Medido num GIF de 240x160 cortado a 100x100: os frames saem a 100x100 mas
 *    o ficheiro declara `page=240x160+70+30`, e o leitor desenha a animacao numa
 *    tela de 240x160 com o conteudo deslocado. Acontece tambem em PNG
 *    (`page=1200x800+1050+700` num corte de 150x100), onde a maioria dos
 *    leitores ignora mas o metadado fica a mentir. A correcao e `resetPage()`,
 *    e custa zero bytes: 45 852 com e sem.
 *  - o metodo chama-se `resetPage()`. `repage()`, que e o nome da linha de
 *    comandos, NAO existe neste binding: `f.repage is not a function`.
 *  - `crop` com uma caixa maior do que a imagem NAO lanca: trava em silencio.
 *    Medido, pedir 600x400 num 400x300 devolve 400x300. Quem promete dimensoes
 *    ao utilizador tem de as travar antes, senao promete uma coisa e entrega
 *    outra.
 *  - `statistics(Channels.Alpha)` devolve a media em unidades de quantum
 *    (0 a 255 nesta build Q8), nao normalizada. `maximum` e o maior valor
 *    PRESENTE e nao o teto do quantum, portanto nao serve de divisor: numa
 *    imagem toda transparente vale 0.
 *  - `collection.optimize()` volta a reduzir os frames as regioes que mudam.
 *    Medido: com 8 frames iguais, 523 089 bytes passaram a 66 290. Com frames
 *    genuinamente diferentes o ganho e nulo, porque nao ha nada repetido para
 *    remover. Nunca aumentou.
 */
import {
  AlphaAction,
  Channels,
  DitherMethod,
  initializeImageMagick,
  Interlace,
  Kernel,
  Magick,
  MagickColor,
  MagickFormat,
  MagickGeometry,
  MagickImageCollection,
  MagickReadSettings,
  MorphologyMethod,
  MorphologySettings,
  Percentage,
  PixelChannel,
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
        backgroundKeptPercent: codificado.backgroundKeptPercent,
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
  /** Null quando a remocao de fundo nao foi pedida. */
  readonly backgroundKeptPercent: number | null
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

  const aplicados: Aplicado[] = []
  for (const frame of colecao) aplicados.push(aplicarDiretivas(frame, diretivas))

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
    profilesKept: aplicados[0]?.profilesKept ?? [],
    frames: colecao.length,
    // O primeiro frame tambem descreve o recorte: a tolerancia e a mesma em
    // todos, e e o frame que o utilizador ve na pre-visualizacao.
    backgroundKeptPercent: aplicados[0]?.backgroundKeptPercent ?? null,
  }
}

/** Saida de um frame so, quando o destino guarda uma imagem apenas. */
function escreverUmFrame(
  colecao: IMagickImageCollection,
  origem: ImageFormatCapability | null,
  diretivas: EncodeDirectives,
): Codificado {
  const frame = escolherFrame(colecao, origem)
  const aplicado = aplicarDiretivas(frame, diretivas)

  return {
    bytes: frame.write(comoMagickFormat(diretivas.magickFormat), (d) => d.slice()),
    width: frame.width,
    height: frame.height,
    profilesKept: aplicado.profilesKept,
    frames: 1,
    backgroundKeptPercent: aplicado.backgroundKeptPercent,
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

/** Cor de preenchimento do fundo: totalmente transparente. */
const TRANSPARENTE = new MagickColor(0, 0, 0, 0)

/** Teto do quantum nesta build. Q8, portanto 255. Ver src/config/engine.ts. */
const QUANTUM_MAXIMO = 255

/**
 * Remove o fundo por preenchimento a partir dos quatro cantos.
 *
 * A partir dos cantos e nao por cor global: um recorte da cor do fundo DENTRO
 * do objeto, como o brilho branco de um produto fotografado sobre branco, tem
 * de sobreviver. Medido na mesma imagem: 78,7 % de fundo removido com o
 * recorte interior intacto pelos cantos, contra 79,9 % pelo limiar global, em
 * que a diferenca de 1,2 % era precisamente o recorte a desaparecer.
 *
 * Os quatro cantos e nao um: um fundo com gradiente nao e uma unica regiao
 * contigua dentro da tolerancia, e partindo so do canto superior esquerdo
 * ficava metade do fundo por remover.
 *
 * `colorFuzz` e reposto porque e estado da imagem e nao um argumento: deixa-lo
 * alterado mudava o comportamento de qualquer operacao seguinte que compare
 * cores.
 */
function removerFundo(img: IMagickImage, tolerancePercent: number): void {
  img.alpha(AlphaAction.Set)

  const fuzzAnterior = img.colorFuzz
  img.colorFuzz = new Percentage(tolerancePercent)
  try {
    for (const [x, y] of [
      [0, 0],
      [img.width - 1, 0],
      [0, img.height - 1],
      [img.width - 1, img.height - 1],
    ] as const) {
      img.floodFill(TRANSPARENTE, x, y)
    }
  } finally {
    img.colorFuzz = fuzzAnterior
  }

  /*
   * O preenchimento e binario: um pixel fica transparente ou fica intacto, sem
   * meio termo. Numa fronteira suave, que e o que qualquer fotografia tem, os
   * pixeis que ficam do lado de fora da tolerancia mantem a cor do fundo com
   * opacidade total, e o resultado tem uma auréola visivel quando e colocado
   * sobre outra cor. Medido num JPEG q80 com fronteira esfumada: 0,36 % da
   * imagem em pixeis de franja.
   *
   * Come 1 px para dentro e depois esfuma a fronteira. Nao elimina a auréola
   * por completo, porque um limiar de cor nao sabe separar o que esta
   * misturado, mas passa-a de opaca a parcialmente transparente, que e a
   * diferenca entre um contorno claro e uma fronteira que se funde.
   */
  const erodir = new MorphologySettings(MorphologyMethod.Erode, Kernel.Diamond, '1')
  erodir.channels = Channels.Alpha
  img.morphology(erodir)
  img.blur(0, 0.8, Channels.Alpha)
}

/**
 * Percentagem da imagem que ficou opaca, estimada pela media do canal alfa.
 *
 * Pela media e nao contando pixeis: contar obriga a trazer w x h bytes do WASM
 * para JS e a percorre-los, o que a 24 MP sao 24 MB e 24 milhoes de iteracoes.
 * A media e calculada dentro do WASM numa passagem. Como depois do
 * preenchimento a esmagadora maioria dos pixeis e 0 ou opaco, a media aproxima
 * a contagem: medido 79,0 % contra 78,7 % exactos, uma diferenca de 0,3 pontos.
 *
 * Os dois extremos, que sao o que interessa, sao exactos: media 0 significa
 * imagem inteiramente transparente, media no maximo significa que nada foi
 * removido.
 */
function percentagemOpaca(img: IMagickImage): number {
  const alfa = img.statistics(Channels.Alpha).getChannel(PixelChannel.Alpha)
  if (!alfa) return 100
  return Math.max(0, Math.min(100, (alfa.mean / QUANTUM_MAXIMO) * 100))
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

type Aplicado = {
  readonly profilesKept: string[]
  /** Null quando a remocao de fundo nao foi pedida. */
  readonly backgroundKeptPercent: number | null
}

/** Aplica a politica a imagem e devolve o que a interface precisa de saber. */
function aplicarDiretivas(img: IMagickImage, d: EncodeDirectives): Aplicado {
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

  /*
   * Antes do resize, ao contrario da paleta.
   *
   * Redimensionar interpola, e na fronteira entre objeto e fundo isso produz
   * pixeis que nao sao nem um nem outro. O limiar de cor deixa de reconhecer
   * esses pixeis como fundo e a franja que sobra fica maior. Nos pixeis
   * originais a fronteira ainda e a do ficheiro.
   */
  /*
   * Antes do fundo e antes do resize.
   *
   * Antes do resize porque cortar e escolher a regiao e redimensionar e
   * escalá-la; a ordem inversa daria outra regiao. Antes do fundo porque o
   * limiar parte dos QUATRO CANTOS, e depois de cortar os cantos sao os do
   * corte, que e o que o utilizador esta a ver.
   */
  if (d.crop) {
    const geo = new MagickGeometry(d.crop.x, d.crop.y, d.crop.width, d.crop.height)
    img.crop(geo)
    // Obrigatorio: sem isto o ficheiro declara a tela original e um
    // deslocamento, e uma animacao cortada sai na tela errada.
    img.resetPage()
  }

  const backgroundKeptPercent = d.background
    ? (removerFundo(img, d.background.tolerancePercent), percentagemOpaca(img))
    : null

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

  return { profilesKept: [...img.profileNames], backgroundKeptPercent }
}
