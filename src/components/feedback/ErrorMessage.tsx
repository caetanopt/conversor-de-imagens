import type { JobError } from '@/features/converter/types'
import styles from './ErrorMessage.module.css'

type Props = {
  readonly erro: JobError
  /** Liga a mensagem ao controlo ou ficheiro certo. CLAUDE.md, seccao 20.6. */
  readonly id?: string
}

/**
 * Mensagem de erro para o utilizador.
 *
 * `erro.detail` existe e contem o texto do motor, mas NAO e renderizado. Uma
 * versao anterior mostrava-o, o que punha coisas como
 * "NoDecodeDelegateForThisImageFormat @ error/blob.c/ImagesToBlob/2477" no
 * ecra. Isso nao ajuda ninguem, parece uma falha do produto, e revela detalhes
 * de implementacao. O detalhe fica reservado ao registo de desenvolvimento.
 */
export function ErrorMessage({ erro, id }: Props) {
  return (
    <div className={styles.erro} id={id} role="alert">
      <p className={styles.mensagem}>{erro.message}</p>
      {erro.suggestion ? <p className={styles.sugestao}>{erro.suggestion}</p> : null}
    </div>
  )
}
