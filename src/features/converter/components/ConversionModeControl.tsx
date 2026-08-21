'use client'

/**
 * Escolha entre otimizar e converter.
 *
 * Nao sao dois produtos nem dois caminhos de codigo: e o mesmo pipeline com uma
 * restricao diferente no formato de destino. Em 'otimizar', o destino e o
 * formato de origem. CLAUDE.md, seccao 12.
 */
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import { formatoPorId, type FormatId } from '@/config/formats'
import type { ConversionMode } from '../types'
import styles from './ConversionModeControl.module.css'

type Props = {
  readonly modo: ConversionMode
  readonly sourceFormat: FormatId | null
  /** Null quando otimizar no mesmo formato nao e possivel para esta origem. */
  readonly formatoDeOtimizacao: FormatId | null
  readonly onChange: (modo: ConversionMode) => void
  readonly disabled?: boolean
}

/**
 * Formatos em que otimizar no mesmo formato nao produz ganho mensuravel com
 * este motor.
 *
 * Medido: o encoder de PNG do ImageMagick nao e um otimizador. Os niveis de
 * compressao 6 e 9 dao bytes identicos, e nivel 0 apenas aumenta 71 %. Nao ha
 * margem. Fingir que "Otimizar" faz algo a um PNG seria enganar o utilizador.
 */
const SEM_GANHO_NO_MESMO_FORMATO: readonly FormatId[] = ['png']

export function ConversionModeControl({
  modo,
  sourceFormat,
  formatoDeOtimizacao,
  onChange,
  disabled = false,
}: Props) {
  const podeOtimizar = formatoDeOtimizacao !== null
  const etiquetaOrigem = sourceFormat ? formatoPorId(sourceFormat).label : null
  const semGanho =
    modo === 'otimizar' &&
    formatoDeOtimizacao !== null &&
    SEM_GANHO_NO_MESMO_FORMATO.includes(formatoDeOtimizacao)

  return (
    <div className={styles.envolvente}>
      <SegmentedControl
        legenda="O que fazer"
        opcoes={[
          { value: 'otimizar', label: 'Otimizar' },
          { value: 'converter', label: 'Converter' },
        ]}
        valor={modo}
        onChange={onChange}
        disabled={disabled || !podeOtimizar}
      />

      <p className={styles.explicacao}>
        {!podeOtimizar
          ? `Não é possível otimizar mantendo ${etiquetaOrigem ?? 'este formato'}. Escolha um formato de destino.`
          : modo === 'otimizar'
            ? `Mantém ${etiquetaOrigem} e reduz o tamanho do ficheiro.`
            : 'Permite escolher outro formato de destino.'}
      </p>

      {semGanho ? (
        <p className={styles.aviso}>
          Otimizar {etiquetaOrigem} para {etiquetaOrigem} não reduz o tamanho nesta versão. Para
          ficheiros mais pequenos, converta para WebP.
        </p>
      ) : null}
    </div>
  )
}
