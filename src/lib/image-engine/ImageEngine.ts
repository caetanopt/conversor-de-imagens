/**
 * Contrato do motor de imagem.
 *
 * Nada acima desta interface conhece ImageMagick. Trocar ou acrescentar um
 * motor (por exemplo codecs especializados para WebP ou AVIF, se os
 * benchmarks o justificarem) e escrever outra implementacao, nao reescrever
 * a aplicacao.
 *
 * Desvio deliberado face ao esboco do CLAUDE.md: `inspect` recebe
 * ArrayBuffer e nao File. O motor vive dentro de um Web Worker e um File
 * nao atravessa a fronteira; atravessam apenas os bytes, transferidos sem
 * copia. Manter File na assinatura obrigaria a uma copia extra de cada
 * imagem, contra o requisito 19.4.
 */
import type { FormatId } from '@/config/formats'
import type { ConversionOptions, ImageInspection } from '@/features/converter/types'

export type EngineCapabilities = {
  readonly engineVersion: string
  readonly delegates: readonly string[]
  readonly channelDepth: number
}

export type EngineConversion = {
  /** Bytes crus. O Blob e construido na main thread, para o buffer poder ser transferido. */
  readonly bytes: Uint8Array
  readonly width: number
  readonly height: number
  readonly formatId: FormatId
  readonly durationMs: number
  /** Separados porque um decode lento e um encode lento tem causas diferentes. */
  readonly decodeMs: number
  readonly encodeMs: number
  /** Perfis que sobreviveram a politica de metadados. */
  readonly profilesKept: readonly string[]
  /** Frames que o ficheiro de entrada tinha. */
  readonly frameCount: number
  /**
   * Frames que o ficheiro de saida tem.
   *
   * Menos do que a entrada significa que houve perda: uma animacao achatada,
   * ou um ICO de varios tamanhos reduzido a um. A interface tem de o dizer, e
   * antes da conversao, nao depois. CLAUDE.md, seccao 5.8.
   */
  readonly outputFrameCount: number
}

/**
 * Miniatura produzida pelo motor.
 *
 * Existe para os formatos que o browser nao descodifica, hoje TIFF. Sem isto,
 * carregar um TIFF dava uma area de pre-visualizacao vazia sem explicacao.
 */
export type EngineThumbnail = {
  readonly bytes: Uint8Array
  readonly width: number
  readonly height: number
  /** Formato da miniatura, para a main thread construir o Blob certo. */
  readonly formatId: FormatId
  readonly durationMs: number
}

/** Pista de formato para entradas com magic bytes fracos, como ICO ou TGA. */
export type FormatHint = { readonly magickFormat: string | null }

export interface ImageEngine {
  getCapabilities(): Promise<EngineCapabilities>
  inspect(input: ArrayBuffer, hint: FormatHint): Promise<ImageInspection>
  convert(
    input: ArrayBuffer,
    options: ConversionOptions,
    hint?: FormatHint,
  ): Promise<EngineConversion>
  thumbnail(input: ArrayBuffer, hint: FormatHint, larguraMaxima: number): Promise<EngineThumbnail>
  dispose(): void
}
