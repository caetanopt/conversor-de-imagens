import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './Button.module.css'

type Variante = 'primario' | 'secundario' | 'discreto'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variante?: Variante
  readonly children: ReactNode
}

export function Button({ variante = 'secundario', className, children, ...resto }: Props) {
  const classes = [styles.botao, styles[variante], className].filter(Boolean).join(' ')
  return (
    <button type="button" className={classes} {...resto}>
      {children}
    </button>
  )
}
