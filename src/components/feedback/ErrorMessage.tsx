import type { JobError } from '@/features/converter/types'
import styles from './ErrorMessage.module.css'

type Props = {
  readonly erro: JobError
  /** Liga a mensagem ao controlo ou ficheiro certo. CLAUDE.md, seccao 20.6. */
  readonly id?: string
}

export function ErrorMessage({ erro, id }: Props) {
  return (
    <div className={styles.erro} id={id} role="alert">
      <p className={styles.mensagem}>{erro.message}</p>
      {erro.detail ? <p className={styles.detalhe}>{erro.detail}</p> : null}
    </div>
  )
}
