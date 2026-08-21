'use client'

/**
 * Barra de acoes persistente.
 *
 * Os tamanhos ficam junto da acao de descarregar, porque e ali que o
 * utilizador decide se o resultado lhe serve. CLAUDE.md, seccao 13.
 */
import { Button } from '@/components/controls/Button'
import { formatoPorId } from '@/config/formats'
import { formatarBytes } from '@/lib/format/bytes'
import type { ImageJob } from '../types'
import styles from './BatchActionBar.module.css'

type Props = {
  readonly job: ImageJob
  readonly onConverter: () => void
  readonly onDescarregar: () => void
  readonly onCancelar: () => void
  readonly motorPronto: boolean
}

export function BatchActionBar({
  job,
  onConverter,
  onDescarregar,
  onCancelar,
  motorPronto,
}: Props) {
  const aProcessar = job.status === 'processing'
  const concluido = job.status === 'done' && job.result !== null
  const bloqueado = job.status === 'error' && job.result === null
  const destino = formatoPorId(job.options.outputFormat)

  return (
    <div className={styles.barra}>
      <div className={styles.numeros}>
        <span className={styles.par}>
          <span className="etiqueta">Original</span>
          <span className="numerico">{formatarBytes(job.sourceSize)}</span>
        </span>
        <span className={styles.par}>
          <span className="etiqueta">Final</span>
          <span className={`${styles.final} numerico`}>
            {job.result ? formatarBytes(job.result.size) : '--'}
          </span>
        </span>
      </div>

      <div className={styles.acoes}>
        {aProcessar ? (
          <Button variante="secundario" onClick={onCancelar}>
            Cancelar
          </Button>
        ) : null}

        {concluido ? (
          <Button variante="primario" onClick={onDescarregar}>
            Descarregar {destino.label}
          </Button>
        ) : (
          <Button
            variante="primario"
            onClick={onConverter}
            disabled={aProcessar || bloqueado || !motorPronto}
          >
            {aProcessar ? 'A converter...' : `Converter para ${destino.label}`}
          </Button>
        )}
      </div>
    </div>
  )
}
