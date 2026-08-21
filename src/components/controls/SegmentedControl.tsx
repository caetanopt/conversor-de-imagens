'use client'

/**
 * Escolha entre poucas opcoes mutuamente exclusivas.
 *
 * Implementado com radios reais e nao com botoes, para as setas do teclado
 * funcionarem sem codigo nosso e o estado ser anunciado corretamente.
 */
import { useId } from 'react'
import styles from './SegmentedControl.module.css'

export type OpcaoSegmentada<T extends string> = {
  readonly value: T
  readonly label: string
  readonly hint?: string
}

type Props<T extends string> = {
  readonly legenda: string
  readonly opcoes: readonly OpcaoSegmentada<T>[]
  readonly valor: T
  readonly onChange: (valor: T) => void
  readonly disabled?: boolean
  /**
   * 'vertical' para rotulos longos em contentores estreitos. Tres rotulos
   * como "Ficheiro mais pequeno" num painel de 320 px quebram em duas linhas
   * desalinhadas se forem dispostos na horizontal.
   */
  readonly orientacao?: 'horizontal' | 'vertical'
}

export function SegmentedControl<T extends string>({
  legenda,
  opcoes,
  valor,
  onChange,
  disabled = false,
  orientacao = 'horizontal',
}: Props<T>) {
  const nome = useId()

  return (
    <fieldset className={styles.grupo} disabled={disabled}>
      <legend className="etiqueta">{legenda}</legend>
      <div className={`${styles.faixa} ${styles[orientacao]}`}>
        {opcoes.map((opcao) => (
          <label key={opcao.value} className={styles.opcao}>
            <input
              type="radio"
              name={nome}
              value={opcao.value}
              checked={valor === opcao.value}
              onChange={() => onChange(opcao.value)}
              className={styles.entrada}
            />
            <span className={styles.rotulo}>{opcao.label}</span>
            {opcao.hint ? <span className={styles.dica}>{opcao.hint}</span> : null}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
