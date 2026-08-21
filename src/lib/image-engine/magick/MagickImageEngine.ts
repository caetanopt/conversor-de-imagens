/**
 * Implementacao de ImageEngine sobre @imagemagick/magick-wasm.
 *
 * ESTE E O UNICO FICHEIRO DA APLICACAO QUE IMPORTA magick-wasm.
 * Um teste verifica que o motor nao aparece em nenhum bundle da main thread.
 *
 * Notas de API, todas verificadas contra a versao 0.0.42 e nao lidas na
 * documentacao:
 *
 *  - `interlace` e apenas leitura na imagem. O JPEG progressivo obtem-se com
 *    `img.settings.interlace`, confirmado pelo marcador SOF 0xFFC2 no output.
 *  - `write` com um formato invalido NAO lanca. Cai na sobrecarga que grava no
 *    formato de origem e devolve um ficheiro valido no formato errado. E o pior
 *    tipo de falha possivel aqui, por isso `comoMagickFormat` valida antes.
 *  - `setDefine` vive em `img.settings`, nao em `img`.
 *  - `collection.ping(bytes)` le cabecalhos sem descodificar pixels e da
 *    dimensoes, formato, alfa e numero de frames. E o que sustenta `inspect`.
 *  - `MagickGeometry.greater = true` significa "so reduzir", e
 *    `ignoreAspectRatio = true` significa dimensoes exatas. Por defeito a
 *    proporcao e preservada, que e o comportamento que queremos.
 */
import {
  ImageMagick,
  initializeImageMagick,
  Interlace,
  Magick,
  MagickGeometry,
  MagickImageCollection,
  MagickFormat,
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

    const resultado = ImageMagick.read(new Uint8Array(input), (img) => {
      aplicarDiretivas(img, diretivas)
      const bytes = img.write(comoMagickFormat(diretivas.magickFormat), (d) => d.slice())
      return { bytes, width: img.width, height: img.height }
    })

    return {
      bytes: resultado.bytes,
      width: resultado.width,
      height: resultado.height,
      formatId: destino.id,
      durationMs: Math.round(performance.now() - inicio),
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

function aplicarDiretivas(img: IMagickImage, d: EncodeDirectives): void {
  // Ordem obrigatoria: a orientacao tem de ser aplicada aos pixels antes de o
  // EXIF ser removido, senao a imagem sai deitada. CLAUDE.md, seccao 23.
  if (d.autoOrient) img.autoOrient()
  if (d.strip) img.strip()

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
}
