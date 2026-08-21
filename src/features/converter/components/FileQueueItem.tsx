'use client'

/**
 * Uma linha da fila de ficheiros.
 *
 * Duas linhas de informacao em vez de uma: num rail de 264 px, nome, formato,
 * tamanho, estado e accao nao cabem lado a lado sem se sobreporem. O nome e o
 * botao de remover ficam na primeira linha, os tamanhos e o estado na segunda,
 * a toda a largura.
 *
 * O alvo de selecao e a linha inteira, obtido esticando um pseudo-elemento do
 * botao do nome por cima do cartao. E preciso porque um botao que envolvesse os
 * tamanhos tambem teria de envolver o botao de remover, e botoes encaixados
 * nao sao validos.
 *
 * As accoes por ficheiro, descarregar e cancelar, aparecem apenas na linha
 * selecionada. Com trinta ficheiros, tres botoes em cada linha nao caberiam no
 * rail e tornariam a lista tres vezes mais alta. Nada fica escondido: um clique
 * na linha traz as accoes dessa linha.
 *
 * Com um unico ficheiro na fila nao aparecem, porque a barra de acoes ja tem
 * descarregar e cancelar a dois centimetros de distancia.
 *
 * O erro vive dentro da linha e nao no rail. Um lote pode ter tres ficheiros a
 * falhar por razoes diferentes, e a mensagem tem de estar junto do ficheiro a
 * que pertence. CLAUDE.md, seccao 20.6.
 */
import { Button } from '@/components/controls/Button'
import { ErrorMessage } from '@/components/feedback/ErrorMessage'
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
  readonly selecionado: boolean
  /** Falso com um unico ficheiro na fila. Ver o comentario do modulo. */
  readonly lote: boolean
  readonly onSelecionar: (id: string) => void
  readonly onRemover: (id: string) => void
  readonly onCancelar: (id: string) => void
  readonly onDescarregar: (job: ImageJob) => void
}

export function FileQueueItem({
  job,
  selecionado,
  lote,
  onSelecionar,
  onRemover,
  onCancelar,
  onDescarregar,
}: Props) {
  const emFoco = lote && selecionado
  const podeDescarregar = job.status === 'done' && job.result !== null
  const podeCancelar = job.status === 'processing'

  return (
    <article className={`${styles.item} ${emFoco ? styles.selecionado : ''}`}>
      <div className={styles.topo}>
        {/* O nome pode ser longo. Truncamos no fim e mantemos o titulo completo
            disponivel ao passar o rato. */}
        {lote ? (
          <button
            type="button"
            className={styles.seletor}
            title={job.sourceName}
            aria-pressed={selecionado}
            onClick={() => onSelecionar(job.id)}
          >
            {job.sourceName}
          </button>
        ) : (
          <h2 className={styles.seletor} title={job.sourceName}>
            {job.sourceName}
          </h2>
        )}

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
        {/* O formato so aparece quando diz algo que a extensao nao diz: um PNG
            chamado .jpg, ou um ficheiro sem extensao. Nas outras linhas seria
            uma etiqueta a repetir o nome e a roubar espaco. */}
        {etiquetaDeFormato(job) ? (
          <span className={styles.formato}>{etiquetaDeFormato(job)}</span>
        ) : null}
        <span className={styles.tamanhos}>
          <span className="numerico">{formatarBytes(job.sourceSize)}</span>
          {job.result ? (
            <>
              <span aria-hidden="true" className={styles.seta}>
                →
              </span>
              <span className={`${styles.final} numerico`}>{formatarBytes(job.result.size)}</span>
            </>
          ) : null}
        </span>
        <span className={`${styles.estado} ${styles[job.status]}`}>
          {ROTULO_ESTADO[job.status]}
        </span>
      </p>

      {emFoco && (podeDescarregar || podeCancelar) ? (
        <div className={styles.acoes}>
          {podeDescarregar ? (
            <Button
              variante="secundario"
              onClick={() => onDescarregar(job)}
              aria-label={`Descarregar ${job.sourceName}`}
            >
              Descarregar
            </Button>
          ) : null}
          {podeCancelar ? (
            <Button
              variante="secundario"
              onClick={() => onCancelar(job.id)}
              aria-label={`Cancelar ${job.sourceName}`}
            >
              Cancelar
            </Button>
          ) : null}
        </div>
      ) : null}

      {job.error ? <ErrorMessage erro={job.error} /> : null}
    </article>
  )
}

/**
 * Etiqueta de formato, ou null quando nao acrescenta informacao.
 *
 * A extensao do nome ja diz o formato na maioria dos casos. A etiqueta existe
 * para os que nao dizem: um PNG chamado `.jpg`, ou um ficheiro sem extensao.
 */
function etiquetaDeFormato(job: ImageJob): string | null {
  if (!job.sourceFormat) return null

  const formato = formatoPorId(job.sourceFormat)
  const ponto = job.sourceName.lastIndexOf('.')
  const extensao = ponto > 0 ? job.sourceName.slice(ponto + 1).toLowerCase() : null

  if (extensao !== null && formato.extensions.includes(extensao)) return null
  return formato.label
}
