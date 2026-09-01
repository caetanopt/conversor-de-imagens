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
 * Nao sao palpites nem uma regra de tres. Os do JPEG em `equilibrado` e `menor`
 * foram fixados pelo responsavel do projeto; os do WebP e do AVIF foram
 * calibrados por distorcao medida com SSIM para dar aproximadamente a mesma
 * qualidade visual no mesmo preset.
 *
 * A calibracao importa porque as escalas de qualidade nao sao comparaveis entre
 * formatos: em `equilibrado`, a qualidade 50 em AVIF da a mesma distorcao que a
 * 70 em WebP e que a 60 em JPEG. Sem isto, um preset chamado "Equilibrado"
 * significava coisas diferentes em cada formato.
 *
 * Medido numa imagem de 640x480 com gradiente e estrutura. A distorcao e SSIM,
 * onde 0 significa identico ao original:
 *
 *   preset         JPEG                WebP                AVIF
 *   alta           q92                 q90, 78 298 B       q80, 76 987 B
 *   equilibrado    q60, 24 747 B       q70, 20 902 B       q50, 19 134 B
 *                  SSIM 0,1591         SSIM 0,1603         SSIM 0,1570
 *   menor          q40, 15 614 B       q55, 13 720 B       q40, 10 247 B
 *                  SSIM 0,1725         SSIM 0,1736         SSIM 0,1720
 *
 * Em `alta` a ancora foi o WebP, calibrado antes destes valores; em
 * `equilibrado` e `menor` a ancora e o JPEG e os outros dois formatos foram
 * medidos contra ele.
 *
 * O JXL nao esta calibrado. O formato esta em avaliacao, nao chega a interface e
 * nao existe medicao dele: os valores acompanham o JPEG, cuja escala de
 * qualidade e a mais proxima, e terao de ser medidos antes de o formato ser
 * ativado.
 *
 * Ver docs/medicoes.md e tests/unit/qualidade.test.ts.
 */
const TABELA: Record<PresetId, Partial<Record<FormatId, number>>> = {
  alta: { jpeg: 92, webp: 90, avif: 80, jxl: 92 },
  equilibrado: { jpeg: 60, webp: 70, avif: 50, jxl: 60 },
  menor: { jpeg: 40, webp: 55, avif: 40, jxl: 40 },
}

/** Devolve null para formatos sem qualidade com perda, como PNG. */
export function qualidadeDoPreset(preset: PresetId, formato: ImageFormatCapability): number | null {
  if (!formato.supportsQuality) return null
  return TABELA[preset][formato.id] ?? formato.defaultQuality
}

export const PRESET_POR_DEFEITO: PresetId = 'equilibrado'
