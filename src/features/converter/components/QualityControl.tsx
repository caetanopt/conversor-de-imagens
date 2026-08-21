'use client'

/**
 * Qualidade e presets.
 *
 * Nao aparece quando o formato de destino nao tem qualidade com perda. Um
 * deslizador de qualidade num PNG seria um controlo sem efeito, o que o
 * CLAUDE.md proibe na seccao 11.
 */
import { Slider } from '@/components/controls/Slider'
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import { formatoPorId, type FormatId } from '@/config/formats'
import { PRESETS, type PresetId } from '@/config/presets'
import styles from './QualityControl.module.css'

type Props = {
  readonly outputFormat: FormatId
  readonly quality: number | null
  readonly preset: PresetId | null
  readonly onQualidade: (valor: number) => void
  readonly onPreset: (preset: PresetId) => void
  readonly disabled?: boolean
}

export function QualityControl({
  outputFormat,
  quality,
  preset,
  onQualidade,
  onPreset,
  disabled = false,
}: Props) {
  const formato = formatoPorId(outputFormat)

  if (!formato.supportsQuality || quality === null) {
    return (
      <p className={styles.semQualidade}>
        {formato.label} é um formato sem perda. O tamanho depende do conteúdo da imagem, não de
        um valor de qualidade.
      </p>
    )
  }

  return (
    <div className={styles.envolvente}>
      <SegmentedControl
        legenda="Preset"
        opcoes={PRESETS.map((p) => ({ value: p.id, label: p.label }))}
        valor={preset ?? 'equilibrado'}
        onChange={onPreset}
        disabled={disabled}
        orientacao="vertical"
      />

      <Slider
        label="Qualidade"
        valor={quality}
        min={1}
        max={100}
        sufixo="%"
        descricao={
          preset === null
            ? 'Valor manual. Escolher um preset substitui este número.'
            : 'Ajustar manualmente desliga o preset.'
        }
        onChange={onQualidade}
        disabled={disabled}
      />
    </div>
  )
}
