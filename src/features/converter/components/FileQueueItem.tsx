'use client'

/**
 * Uma linha da fila de ficheiros.
 *
 * Duas linhas em vez de uma: num rail de 264 px, nome, formato, tamanho,
 * estado e accao nao cabem lado a lado sem se sobreporem. O nome fica sozinho
 * na primeira linha, com os metadados e o estado na segunda.
 *
 * Nesta etapa a fila tem um elemento, mas o componente recebe um `ImageJob`
 * isolado e nao conhece o resto da lista, para o lote nao obrigar a reescrever.
 */
import { Button } from '@/components/controls/Button'
import { formatoPorId } from '@/config/formats'
import { formatarBytes } from '@/lib/format/bytes'
import type { ImageJob } from '../types'
import styles from './FileQueueItem.module.css'

const ROTULO_ESTADO: Record<ImageJob['status'], string> = {
  ready: 'Pronto',
  processing: 'A processar',
  done: 'Concluído',
  error: 'Erro',
  cancelled: 'Cancelado',
}

type Props = {
  readonly job: ImageJob
  readonly onRemover: (id: string) => void
}

export function FileQueueItem({ job, onRemover }: Props) {
  const origem = job.sourceFormat ? formatoPorId(job.sourceFormat).label : null

  return (
    <article className={styles.item}>
      <div className={styles.cabecalho}>
        {/* O nome pode ser longo. Truncamos no fim e mantemos o titulo completo
            disponivel ao passar o rato. */}
        <h2 className={styles.nome} title={job.sourceName}>
          {job.sourceName}
        </h2>
        <Button
          variante="discreto"
          className={styles.remover}
          onClick={() => onRemover(job.id)}
          aria-label={`Remover ${job.sourceName}`}
        >
          Remover
        </Button>
      </div>

      <p className={styles.meta}>
        {origem ? <span className={styles.formato}>{origem}</span> : null}
        <span className="numerico">{formatarBytes(job.sourceSize)}</span>
        <span className={`${styles.estado} ${styles[job.status]}`}>
          {ROTULO_ESTADO[job.status]}
        </span>
      </p>
    </article>
  )
}
