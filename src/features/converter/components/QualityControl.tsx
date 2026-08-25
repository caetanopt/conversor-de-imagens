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
import { permiteEscolherSemPerda } from '@/lib/image-engine/options'
import styles from './QualityControl.module.css'

type Props = {
  readonly outputFormat: FormatId
  readonly quality: number | null
  readonly preset: PresetId | null
  readonly lossless: boolean
  readonly onQualidade: (valor: number) => void
  readonly onPreset: (preset: PresetId) => void
  readonly onSemPerda: (lossless: boolean) => void
  readonly disabled?: boolean
}


export function QualityControl({
  outputFormat,
  quality,
  preset,
  lossless,
  onQualidade,
  onPreset,
  onSemPerda,
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

  const podeSemPerda = permiteEscolherSemPerda(formato)
  const semPerda = podeSemPerda && lossless

  return (
    <div className={styles.envolvente}>
      {/*
        Com sem perda ligado, o preset e o deslizador nao descrevem nada: a
        qualidade esta imposta. Mostra-los seria mostrar controlos sem efeito,
        que e o que o CLAUDE.md proibe na seccao 11.
      */}
      {semPerda ? null : (
        <>
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
            valor={Math.min(quality, formato.maxQuality)}
            min={1}
            // O teto vem do formato. Em AVIF a qualidade 100 lanca erro do
            // encoder, e em WebP pertence ao controlo de sem perda.
            max={formato.maxQuality}
            sufixo="%"
            descricao={
              preset === null
                ? 'Valor manual. Escolher um preset substitui este número.'
                : 'Ajustar manualmente desliga o preset.'
            }
            onChange={onQualidade}
            disabled={disabled}
          />
        </>
      )}

      {podeSemPerda ? (
        <div className={styles.semPerda}>
          <label className={styles.ligar}>
            <input
              type="checkbox"
              checked={semPerda}
              disabled={disabled}
              onChange={(evento) => onSemPerda(evento.target.checked)}
            />
            <span>Sem perda</span>
          </label>
          <p className={styles.nota}>
            {semPerda
              ? `Os pixéis ficam idênticos ao original. Em ${formato.label} isto costuma dar um ficheiro várias vezes maior do que a qualidade mais alta com perda.`
              : `Preserva os pixéis exatamente, à custa de um ficheiro bastante maior.`}
          </p>
        </div>
      ) : null}
    </div>
  )
}
