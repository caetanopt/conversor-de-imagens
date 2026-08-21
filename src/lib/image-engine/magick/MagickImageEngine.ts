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
 */
import {
  ImageMagick,
  initializeImageMagick,
  Interlace,
  Magick,
  MagickFormat,
  MagickGeometry,
  MagickImageCollection,
  MagickReadSettings,
  type IMagickImage,
} from '@imagemagick/magick-wasm'

import { PROFUNDIDADE_DE_CANAL } from '@/config/engine'
import { formatoPorId, formatoPorMagickFormat } from '@/config/formats'
import type { ConversionOptions, ImageInspection } from '@/features/converter/types'
import type {
  EngineCapabilities,
  EngineConversion,
  FormatHint,
  ImageEngine,
} from '../ImageEngine'
import { resolveEncodeDirectives, type EncodeDirectives } from '../options'

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

export class MagickImageEngine implements ImageEngine {
  #pronto = false

  /** Recebe um URL e deixa o proprio magick-wasm buscar o binario. */
  async initialize(wasmUrl: string): Promise<void> {
    if (this.#pronto) return
    await initializeImageMagick(new URL(wasmUrl, self.location.origin))
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
    const bytes = new Uint8Array(input)
    const colecao = MagickImageCollection.create()
    try {
      // ping le cabecalhos. Nao descodifica pixels, logo e barato mesmo a 24 MP.
      if (hint.magickFormat) {
        colecao.ping(bytes, new MagickReadSettings({ format: comoMagickFormat(hint.magickFormat) }))
      } else {
        colecao.ping(bytes)
      }

      const primeiro = colecao[0]
      if (!primeiro) throw new Error('ImproperImageHeader: nenhuma imagem no ficheiro')

      const magickFormat = String(primeiro.format)
      return {
        formatId: formatoPorMagickFormat(magickFormat)?.id ?? null,
        magickFormat,
        width: primeiro.width,
        height: primeiro.height,
        frameCount: colecao.length,
        hasAlpha: primeiro.hasAlpha,
      }
    } finally {
      colecao.dispose()
    }
  }

  async convert(input: ArrayBuffer, options: ConversionOptions): Promise<EngineConversion> {
    this.#assertPronto()
    const diretivas = resolveEncodeDirectives(options)
    const destino = formatoPorId(options.outputFormat)

    const inicio = performance.now()
    let fimDoDecode = inicio

    const resultado = ImageMagick.read(new Uint8Array(input), (img) => {
      // A chamada a `read` ja descodificou quando o callback comeca, portanto
      // este e o ponto que separa decode de encode.
      fimDoDecode = performance.now()

      const profilesKept = aplicarDiretivas(img, diretivas)
      const bytes = img.write(comoMagickFormat(diretivas.magickFormat), (d) => d.slice())
      return { bytes, width: img.width, height: img.height, profilesKept }
    })

    const fim = performance.now()

    return {
      bytes: resultado.bytes,
      width: resultado.width,
      height: resultado.height,
      formatId: destino.id,
      durationMs: Math.round(fim - inicio),
      decodeMs: Math.round(fimDoDecode - inicio),
      encodeMs: Math.round(fim - fimDoDecode),
      profilesKept: resultado.profilesKept,
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

  if (d.quality !== null) img.quality = d.quality
  if (d.interlace) img.settings.interlace = Interlace.Plane

  for (const define of d.defines) {
    img.settings.setDefine(comoMagickFormat(define.format), define.name, define.value)
  }

  return [...img.profileNames]
}
