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
 *
 *  4. Sem perda em WebP obtem-se com qualidade 100, e nao com o define
 *     `webp:lossless`. Medido com SSIM, onde 0 significa identico ao original:
 *
 *       q100                    1 065 458 bytes   SSIM 0
 *       define lossless + q100  1 065 458 bytes   SSIM 0        (bytes iguais)
 *       define lossless + q80     745 502 bytes   SSIM 0,0024   (NAO e sem perda)
 *
 *     O define e redundante a 100 e enganador abaixo de 100: prometia sem
 *     perda e devolvia uma imagem alterada. Foi removido, e a opcao de dominio
 *     resolve-se para qualidade 100, que e o caminho que funciona de facto.
 */
import { formatoPorId } from '@/config/formats'
import type {
  BackgroundTolerance,
  ChromaSubsampling,
  ConversionOptions,
  MetadataPolicy,
} from '@/features/converter/types'

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
  /**
   * Cores a que reduzir a paleta, ou null para nao reduzir.
   *
   * Aplicado depois do resize: quantizar primeiro e redimensionar depois
   * voltava a criar cores por interpolacao, e o ganho desaparecia.
   */
  readonly palette: number | null
  /**
   * Remocao de fundo, ou null.
   *
   * Aplicada antes do resize: o limiar de cor funciona nos pixeis originais, e
   * redimensionar primeiro mistura fundo e objeto na fronteira, o que aumenta a
   * franja que sobra. E o oposto da paleta, que tem de vir depois.
   */
  readonly background: BackgroundDirective | null
}

export type BackgroundDirective = {
  /** Tolerancia de cor em percentagem, ja resolvida a partir do nivel. */
  readonly tolerancePercent: number
}

/**
 * Croma por defeito.
 *
 * '4:2:0' e o que a web usa e o que o olho nao distingue numa fotografia.
 * Medido: 4:4:4 custa mais metade do ficheiro. Ver docs/medicoes.md.
 */
export const CROMA_POR_DEFEITO: ChromaSubsampling = '4:2:0'

/** Limites da paleta. 2 e o minimo util, 256 e o maximo de um PNG indexado. */
export const PALETA_MINIMA = 2
export const PALETA_MAXIMA = 256

/**
 * Tolerancia de cor de cada nivel de remocao de fundo, em percentagem.
 *
 * Medida em cinco casos, contando a percentagem de fundo removido. Ver
 * docs/medicoes.md:
 *
 *   caso                    2 %          8 %          18 %
 *   branco puro             78,7 % ok    78,7 % ok    78,7 % ok
 *   estudio com ruido       52,0 % mau   81,1 % ok    81,1 % ok
 *   JPEG q75                78,0 % ok    78,7 % ok    78,7 % ok
 *   objeto quase branco     78,7 % ok    100 % MAU    100 % MAU
 *   fundo fotografico        0,0 % mau     3,0 % mau   61,0 % lixo
 *
 * "100 %" na linha do objeto quase branco significa que a imagem toda
 * desapareceu. E por isso que o defeito e 'exata' e nao 'normal', apesar de a
 * 'normal' resolver mais casos: falhar por deixar fundo e recuperavel, falhar
 * por apagar o objeto nao.
 */
const TOLERANCIA_DO_FUNDO: Record<BackgroundTolerance, number> = {
  exata: 2,
  normal: 8,
  ampla: 18,
}

/**
 * Nivel por defeito quando o utilizador liga a remocao.
 *
 * 'exata' porque e o unico que nao destroi um objeto de cor proxima do fundo.
 */
export const FUNDO_POR_DEFEITO: BackgroundTolerance = 'exata'

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

  const semPerda = permiteEscolherSemPerda(formato) && options.lossless
  const quality = formato.supportsQuality
    ? semPerda
      ? QUALIDADE_SEM_PERDA
      : clampQuality(options.quality, formato.maxQuality)
    : null

  if (formato.id === 'avif') {
    // Sem isto o AVIF e inutilizavel. Ver docs/medicoes.md.
    defines.push({ format: 'HEIC', name: 'speed', value: AVIF_SPEED_POR_DEFEITO })
  }

  /*
   * O croma tem de ser declarado sempre, e nao apenas quando difere do defeito.
   *
   * Sem este define o ImageMagick HERDA a subamostragem do ficheiro de origem.
   * Uma fotografia exportada em 4:4:4 saia em 4:4:4, e a otimizacao rendia
   * 37,8 % em vez de 59,6 % na mesma imagem. Ver docs/medicoes.md.
   */
  if (formato.supportsChromaSubsampling) {
    defines.push({ format: 'JPEG', name: 'sampling-factor', value: options.chroma })
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
    palette: resolvePaleta(options.palette, formato.supportsPalette),
    background: resolveFundo(options.background, formato.supportsAlpha),
  }
}

/**
 * Remocao de fundo, ou null.
 *
 * O filtro pelo alfa vive aqui e nao so na interface, pela mesma razao da
 * paleta: um nivel escolhido num PNG chegaria intacto ao motor depois de o
 * utilizador mudar o destino para JPEG, e o resultado seria um recorte
 * achatado sobre preto sem ninguem ter pedido nada disso.
 */
function resolveFundo(
  background: BackgroundTolerance | null,
  suportaAlfa: boolean,
): BackgroundDirective | null {
  if (!suportaAlfa || background === null) return null
  return { tolerancePercent: TOLERANCIA_DO_FUNDO[background] }
}

/**
 * Cores da paleta, ou null.
 *
 * O filtro pelo formato existe aqui e nao so na interface: um valor escolhido
 * num PNG chegaria intacto ao motor depois de o utilizador mudar o destino para
 * JPEG, e quantizar um JPEG antes de o comprimir so piora o resultado.
 */
function resolvePaleta(palette: number | null, suporta: boolean): number | null {
  if (!suporta || palette === null) return null
  if (!Number.isFinite(palette)) return null
  return Math.min(PALETA_MAXIMA, Math.max(PALETA_MINIMA, Math.round(palette)))
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

/**
 * Qualidade que produz saida sem perda.
 *
 * E 100, medido. Nao e um numero escolhido: e o unico ponto da escala do WebP
 * em que o SSIM contra o original e exatamente zero.
 */
export const QUALIDADE_SEM_PERDA = 100

/**
 * Onde "sem perda" e uma escolha do utilizador e nao uma propriedade do formato.
 *
 * Um PNG e sempre sem perda, portanto oferecer a opcao seria um controlo sem
 * efeito. Um WebP pode ser as duas coisas, e ai a escolha existe. O AVIF deste
 * motor nao tem modo sem perda: a qualidade 100 lanca erro do encoder.
 */
export function permiteEscolherSemPerda(formato: {
  readonly supportsQuality: boolean
  readonly supportsLossless: boolean
}): boolean {
  return formato.supportsQuality && formato.supportsLossless
}

/**
 * O teto vem do formato e nao e sempre 100. Existe aqui, e nao so na interface,
 * porque um valor guardado antes de o formato mudar chegaria intacto ao motor.
 */
function clampQuality(quality: number | null, maximo: number): number | null {
  if (quality === null) return null
  if (!Number.isFinite(quality)) return null
  return Math.min(maximo, Math.max(1, Math.round(quality)))
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
