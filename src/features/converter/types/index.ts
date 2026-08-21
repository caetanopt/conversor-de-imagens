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

export type ConversionOptions = {
  readonly outputFormat: FormatId
  /** Null quando o formato de destino nao tem qualidade com perda. */
  readonly quality: number | null
  readonly preset: PresetId | null
  readonly stripMetadata: boolean
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
  | 'tempo-excedido'

export type JobError = {
  readonly kind: JobErrorKind
  /** Mensagem em Portugues de Portugal, pronta a mostrar. */
  readonly message: string
  /** Detalhe tecnico para diagnostico. Nunca inclui nome de ficheiro nem EXIF. */
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
