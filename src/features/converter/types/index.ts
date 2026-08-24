/**
 * Modelo de dominio do conversor.
 *
 * Estes tipos nao conhecem ImageMagick nem Web Workers. Sao a linguagem
 * comum entre a interface e a camada do motor.
 */
import type { FormatId } from '@/config/formats'
import type { PresetId } from '@/config/presets'

export type ConversionStatus = 'ready' | 'processing' | 'done' | 'error' | 'cancelled'

export type ConversionMode = 'otimizar' | 'converter'

export type ResizeOptions = {
  readonly width: number | null
  readonly height: number | null
  readonly preserveAspectRatio: boolean
  /** Por defeito falso: nao aumentar imagens pequenas. */
  readonly allowUpscale: boolean
}

/**
 * Politica de metadados.
 *
 * Nao e um booleano porque a decisao nao e binaria. Medimos o impacto de cada
 * opcao (ver docs/medicoes.md, seccao de metadados):
 *
 *  'remover'       apaga tudo, incluindo o perfil de cor. Ficheiro mais
 *                  pequeno, mas uma imagem em AdobeRGB ou Display P3 passa a
 *                  ser interpretada como sRGB e as cores mudam de forma
 *                  visivel. Medido: um vermelho AdobeRGB(220,30,40) precisa de
 *                  sRGB(255,29,40) para ter o mesmo aspeto.
 *
 *  'preservar-cor' apaga EXIF, GPS, XMP, IPTC e 8BIM, e mantem apenas o perfil
 *                  ICC. Verificado ao nivel dos bytes: fabricante, numero de
 *                  serie, data de captura, autor e localidade desaparecem.
 *                  Custo medido: 570 bytes num perfil de 552 bytes.
 *                  E o valor por defeito.
 *
 *  'manter'        nao apaga nada. Escolha explicita do utilizador.
 */
export type MetadataPolicy = 'remover' | 'preservar-cor' | 'manter'

export type ConversionOptions = {
  readonly outputFormat: FormatId
  /** Null quando o formato de destino nao tem qualidade com perda. */
  readonly quality: number | null
  readonly preset: PresetId | null
  readonly metadata: MetadataPolicy
  readonly autoOrient: boolean
  readonly lossless: boolean
  /** Presente no tipo desde ja, ligado a interface numa etapa posterior. */
  readonly resize: ResizeOptions | null
}

/** Resultado de `inspect`: lido dos cabecalhos, sem descodificar os pixels. */
export type ImageInspection = {
  readonly formatId: FormatId | null
  /** Nome cru devolvido pelo motor, util para diagnostico de formatos desconhecidos. */
  readonly magickFormat: string
  readonly width: number
  readonly height: number
  /** Maior que 1 significa animacao ou multipagina. */
  readonly frameCount: number
  readonly hasAlpha: boolean
}

export type ConversionResult = {
  readonly blob: Blob
  readonly size: number
  readonly width: number
  readonly height: number
  readonly formatId: FormatId
  readonly durationMs: number
  /** Separados porque um decode lento e um encode lento tem causas diferentes. */
  readonly decodeMs: number
  readonly encodeMs: number
  /** Perfis que sobreviveram, para a interface poder ser honesta sobre isso. */
  readonly profilesKept: readonly string[]
  /** Frames na entrada e na saida. Diferentes significa perda a declarar. */
  readonly frameCount: number
  readonly outputFrameCount: number
}

export type ImageJob = {
  /** Nunca o nome do ficheiro. Ver CLAUDE.md, seccao 10. */
  readonly id: string
  readonly file: File
  readonly sourceName: string
  readonly sourceSize: number
  readonly sourceFormat: FormatId | null
  readonly inspection: ImageInspection | null
  readonly preview: PreviewRef | null
  readonly options: ConversionOptions
  readonly status: ConversionStatus
  readonly result: ConversionResult | null
  readonly error: JobError | null
  /** Avisos nao bloqueantes, por exemplo perda de animacao ou imagem muito grande. */
  readonly warnings: readonly string[]
}

export type PreviewRef = {
  readonly url: string
  readonly width: number
  readonly height: number
}

export type JobErrorKind =
  | 'ficheiro-invalido'
  | 'formato-nao-suportado'
  | 'demasiado-grande'
  | 'falha-de-leitura'
  | 'falha-de-conversao'
  | 'sem-memoria'
  | 'motor-indisponivel'
  | 'motor-terminado'
  | 'tempo-excedido'
  /**
   * Cancelamento pedido pelo utilizador.
   *
   * Tem de ser distinguivel de uma falha: o worker e terminado nos dois casos,
   * mas cancelar nao e um erro e o trabalho fica em 'cancelled', nao em
   * 'error'. Sem esta distincao, cancelar um ficheiro pintava-o de vermelho.
   */
  | 'cancelado'

export type JobError = {
  readonly kind: JobErrorKind
  /** Mensagem em Portugues de Portugal, pronta a mostrar. */
  readonly message: string
  /** Sugestao concreta do que fazer, quando existe uma. */
  readonly suggestion?: string
  /**
   * Detalhe tecnico do motor, para diagnostico em desenvolvimento.
   *
   * NUNCA e mostrado ao utilizador. Nomes de excecao como
   * NoDecodeDelegateForThisImageFormat ou caminhos internos da biblioteca nao
   * ajudam ninguem e parecem uma falha do produto.
   */
  readonly detail?: string
}

/** Comparacao antes e depois. Um aumento nunca e escondido. */
export type SizeComparison = {
  readonly originalSize: number
  readonly outputSize: number
  readonly deltaBytes: number
  readonly savingPercent: number
  readonly direction: 'reduziu' | 'aumentou' | 'igual'
}
