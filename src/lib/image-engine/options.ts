/**
 * Traduz opcoes de dominio em diretivas concretas para o motor.
 *
 * Funcao pura de proposito: e o sitio onde vivem os achados da prova tecnica,
 * e onde eles ficam cobertos por testes em vez de dependerem de memoria de
 * quem escreveu o codigo.
 *
 * Dois achados estao codificados aqui:
 *
 *  1. JFIF nunca chega ao motor como formato. Nao existe constante para ele e
 *     nao existe encoder. O alias resolve-se via `magickFormat` no registry,
 *     que devolve sempre 'JPEG'.
 *
 *  2. AVIF exige o define heic:speed. Sem ele, 12 MP levaram 19,2 s; com
 *     speed 9, 2,1 s e ficheiro mais pequeno. Um AVIF sem este define nao
 *     e utilizavel em producao.
 */
import { formatoPorId } from '@/config/formats'
import type { ConversionOptions } from '@/features/converter/types'

export type MagickDefine = {
  readonly format: string
  readonly name: string
  readonly value: string
}

export type ResizeDirective = {
  readonly width: number
  readonly height: number
  readonly ignoreAspectRatio: boolean
  readonly onlyShrink: boolean
}

export type EncodeDirectives = {
  readonly magickFormat: string
  /** Null quando o formato nao tem qualidade com perda. Nunca enviar quality a um PNG. */
  readonly quality: number | null
  readonly defines: readonly MagickDefine[]
  /** Aplicado sempre antes do strip, senao a rotacao EXIF perde-se. */
  readonly autoOrient: boolean
  readonly strip: boolean
  readonly resize: ResizeDirective | null
  readonly interlace: boolean
}

/** Velocidade do encoder AVIF. 9 e o mais rapido; medido nove vezes mais rapido que o defeito. */
export const AVIF_SPEED_POR_DEFEITO = '9'

export function resolveEncodeDirectives(options: ConversionOptions): EncodeDirectives {
  const formato = formatoPorId(options.outputFormat)
  const defines: MagickDefine[] = []

  const quality = formato.supportsQuality ? clampQuality(options.quality) : null

  if (formato.id === 'avif') {
    // Sem isto o AVIF e inutilizavel. Ver docs/medicoes.md.
    defines.push({ format: 'HEIC', name: 'speed', value: AVIF_SPEED_POR_DEFEITO })
  }

  if (formato.supportsLossless && options.lossless) {
    if (formato.id === 'webp') defines.push({ format: 'WEBP', name: 'lossless', value: 'true' })
  }

  return {
    magickFormat: formato.magickFormat,
    quality,
    defines,
    autoOrient: options.autoOrient,
    strip: options.stripMetadata,
    resize: resolveResize(options),
    // Progressivo so faz sentido em JPEG e reduz o tamanho percebido no carregamento.
    interlace: formato.id === 'jpeg' && !options.lossless,
  }
}

function clampQuality(quality: number | null): number | null {
  if (quality === null) return null
  if (!Number.isFinite(quality)) return null
  return Math.min(100, Math.max(1, Math.round(quality)))
}

function resolveResize(options: ConversionOptions): ResizeDirective | null {
  const resize = options.resize
  if (!resize) return null
  if (resize.width === null && resize.height === null) return null

  // 0 numa dimensao significa "calcula a partir da outra, mantendo a proporcao",
  // que e a semantica de geometria do proprio ImageMagick.
  return {
    width: resize.width ?? 0,
    height: resize.height ?? 0,
    ignoreAspectRatio: !resize.preserveAspectRatio,
    onlyShrink: !resize.allowUpscale,
  }
}
