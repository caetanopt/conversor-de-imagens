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

/**
 * Valores por preset e por formato.
 *
 * Os do AVIF nao sao palpites nem uma regra de tres: foram calibrados por
 * distorcao medida com SSIM, para dar aproximadamente a mesma qualidade visual
 * que o WebP no mesmo preset. Ver docs/medicoes.md.
 *
 * A calibracao importa porque as escalas de qualidade nao sao comparaveis entre
 * formatos: a qualidade 65 em AVIF da a mesma distorcao que a 80 em WebP.
 * Sem isto, o preset "Equilibrado" significava coisas diferentes em cada
 * formato.
 *
 * Medido numa imagem de 640x480 com gradiente e estrutura:
 *
 *   preset         WebP            AVIF equivalente     ganho do AVIF
 *   alta           q90, 78 298 B   q80, 76 987 B        2 %
 *   equilibrado    q80, 35 302 B   q65, 34 501 B        2 %
 *   menor          q65, 18 046 B   q45, 13 818 B        23 %
 *
 * O ganho do AVIF e modesto em qualidade alta e relevante em qualidade baixa.
 * Nao foi medido com uma fotografia real, onde se espera que seja maior.
 * Ver docs/medicoes.md e tests/unit/qualidade.test.ts.
 */
const TABELA: Record<PresetId, Partial<Record<FormatId, number>>> = {
  alta: { jpeg: 92, webp: 90, avif: 80, jxl: 92 },
  equilibrado: { jpeg: 82, webp: 80, avif: 65, jxl: 80 },
  menor: { jpeg: 70, webp: 65, avif: 45, jxl: 65 },
}

/** Devolve null para formatos sem qualidade com perda, como PNG. */
export function qualidadeDoPreset(preset: PresetId, formato: ImageFormatCapability): number | null {
  if (!formato.supportsQuality) return null
  return TABELA[preset][formato.id] ?? formato.defaultQuality
}

export const PRESET_POR_DEFEITO: PresetId = 'equilibrado'
