'use client'

/**
 * Controlo numerico com deslizador e campo de texto.
 *
 * O campo existe porque num telemovel acertar num valor exato com o dedo e
 * dificil, e porque quem sabe o numero que quer deve poder escreve-lo.
 */
import { useId } from 'react'
import styles from './Slider.module.css'

type Props = {
  readonly label: string
  readonly valor: number
  readonly min: number
  readonly max: number
  readonly step?: number
  readonly sufixo?: string
  readonly descricao?: string
  readonly onChange: (valor: number) => void
  readonly disabled?: boolean
}

export function Slider({
  label,
  valor,
  min,
  max,
  step = 1,
  sufixo,
  descricao,
  onChange,
  disabled = false,
}: Props) {
  const id = useId()
  const descricaoId = `${id}-descricao`

  function aplicar(bruto: string) {
    const numero = Number(bruto)
    if (!Number.isFinite(numero)) return
    onChange(Math.min(max, Math.max(min, Math.round(numero / step) * step)))
  }

  return (
    <div className={styles.envolvente}>
      <div className={styles.topo}>
        <label htmlFor={id} className="etiqueta">
          {label}
        </label>
        <span className={styles.campo}>
          <input
            id={`${id}-numero`}
            type="number"
            className={`${styles.numero} numerico`}
            value={valor}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            aria-label={`${label}, valor exato`}
            onChange={(evento) => aplicar(evento.target.value)}
          />
          {sufixo ? <span className={styles.sufixo}>{sufixo}</span> : null}
        </span>
      </div>

      <input
        id={id}
        type="range"
        className={styles.deslizador}
        value={valor}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-describedby={descricao ? descricaoId : undefined}
        onChange={(evento) => aplicar(evento.target.value)}
      />

      {descricao ? (
        <p id={descricaoId} className={styles.descricao}>
          {descricao}
        </p>
      ) : null}
    </div>
  )
}
