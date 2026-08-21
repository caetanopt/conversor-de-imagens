/**
 * Presets de qualidade.
 *
 * Um preset e uma funcao do formato de destino, nao um numero fixo, porque
 * qualidade 80 em JPEG e qualidade 80 em WebP nao produzem resultados
 * comparaveis. Formatos sem perda ignoram o preset.
 */
import type { FormatId, ImageFormatCapability } from '@/config/formats'

export type PresetId = 'alta' | 'equilibrado' | 'menor'

export type Preset = {
  readonly id: PresetId
  readonly label: string
  readonly descricao: string
}

export const PRESETS: readonly Preset[] = [
  { id: 'alta', label: 'Qualidade alta', descricao: 'Prioriza a fidelidade da imagem.' },
  { id: 'equilibrado', label: 'Equilibrado', descricao: 'Bom compromisso para uso na web.' },
  { id: 'menor', label: 'Ficheiro mais pequeno', descricao: 'Prioriza a redução de tamanho.' },
] as const

const TABELA: Record<PresetId, Partial<Record<FormatId, number>>> = {
  alta: { jpeg: 92, webp: 90, avif: 70, jxl: 92 },
  equilibrado: { jpeg: 82, webp: 80, avif: 55, jxl: 80 },
  menor: { jpeg: 70, webp: 65, avif: 40, jxl: 65 },
}

/** Devolve null para formatos sem qualidade com perda, como PNG. */
export function qualidadeDoPreset(preset: PresetId, formato: ImageFormatCapability): number | null {
  if (!formato.supportsQuality) return null
  return TABELA[preset][formato.id] ?? formato.defaultQuality
}

export const PRESET_POR_DEFEITO: PresetId = 'equilibrado'
