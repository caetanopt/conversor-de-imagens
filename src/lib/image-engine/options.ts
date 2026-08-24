/**
 * Traduz opcoes de dominio em diretivas concretas para o motor.
 *
 * Funcao pura de proposito: e o sitio onde vivem os achados da prova tecnica,
 * e onde eles ficam cobertos por testes em vez de dependerem de memoria de
 * quem escreveu o codigo.
 *
 * Achados codificados aqui:
 *
 *  1. JFIF nunca chega ao motor como formato. Nao existe constante para ele e
 *     nao existe encoder. O alias resolve-se via `magickFormat` no registry,
 *     que devolve sempre 'JPEG'.
 *
 *  2. AVIF exige o define heic:speed. Sem ele, 12 MP levaram 19,2 s; com
 *     speed 9, 2,1 s e ficheiro mais pequeno.
 *
 *  3. A politica de metadados nao e um booleano. `strip()` apaga tambem o
 *     perfil ICC, e sem perfil o browser assume sRGB, o que muda as cores de
 *     forma visivel numa imagem AdobeRGB ou Display P3. Ver docs/medicoes.md.
 */
import { formatoPorId } from '@/config/formats'
import type { ConversionOptions, MetadataPolicy } from '@/features/converter/types'

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

/**
 * O que fazer com os metadados, ja resolvido em acoes concretas.
 *
 * `strip` sozinho apagaria tambem o ICC, por isso a preservacao do perfil e
 * uma acao separada: ler antes, apagar tudo, reanexar.
 */
export type MetadataDirective = {
  readonly strip: boolean
  readonly preserveColorProfile: boolean
}

export type EncodeDirectives = {
  readonly magickFormat: string
  /** Null quando o formato nao tem qualidade com perda. Nunca enviar quality a um PNG. */
  readonly quality: number | null
  readonly defines: readonly MagickDefine[]
  /** Aplicado sempre antes do strip, senao a rotacao EXIF perde-se. */
  readonly autoOrient: boolean
  readonly metadata: MetadataDirective
  readonly resize: ResizeDirective | null
  readonly interlace: boolean
}

/** Velocidade do encoder AVIF. 9 e o mais rapido; medido nove vezes mais rapido que o defeito. */
export const AVIF_SPEED_POR_DEFEITO = '9'

export function resolveMetadataDirective(politica: MetadataPolicy): MetadataDirective {
  switch (politica) {
    case 'remover':
      return { strip: true, preserveColorProfile: false }
    case 'preservar-cor':
      return { strip: true, preserveColorProfile: true }
    case 'manter':
      return { strip: false, preserveColorProfile: true }
  }
}

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
    metadata: resolveMetadataDirective(options.metadata),
    resize: limitarDimensao(resolveResize(options), formato.maxOutputDimension),
    // Progressivo so faz sentido em JPEG e reduz o tamanho percebido no carregamento.
    interlace: formato.id === 'jpeg' && !options.lossless,
  }
}

/**
 * Impoe o limite de dimensao do formato de destino, quando existe.
 *
 * Hoje so o ICO tem um: acima de 256 px o ficheiro declara 256 no
 * ICONDIRENTRY e mente sobre as suas dimensoes. E preferivel reduzir e dizer
 * ao utilizador do que entregar um ficheiro que os leitores da norma leem mal.
 *
 * Sem redimensionamento pedido, o limite entra como caixa delimitadora que so
 * reduz, portanto um icone de 64 px fica em 64. Com redimensionamento pedido,
 * os valores do utilizador sao respeitados mas nunca passam do limite.
 */
export function limitarDimensao(
  resize: ResizeDirective | null,
  limite: number | null,
): ResizeDirective | null {
  if (limite === null) return resize

  if (!resize) {
    return { width: limite, height: limite, ignoreAspectRatio: false, onlyShrink: true }
  }

  // 0 significa "calcula a partir da outra dimensao", e nesse caso o limite e
  // que passa a ser a fronteira daquele lado.
  return {
    width: resize.width === 0 ? limite : Math.min(resize.width, limite),
    height: resize.height === 0 ? limite : Math.min(resize.height, limite),
    ignoreAspectRatio: resize.ignoreAspectRatio,
    // O utilizador pediu dimensoes: nao lhe impomos "so reduzir" por cima.
    onlyShrink: resize.onlyShrink,
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
