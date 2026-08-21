'use client'

/**
 * Pre-visualizacao local.
 *
 * A imagem mostrada e uma miniatura gerada no dispositivo, com dimensoes
 * limitadas. Nunca apontamos um `<img>` ao ficheiro original, para nao
 * descodificar 24 MP so para desenhar algumas centenas de pixels.
 */
import { formatarDimensoes, formatarMegapixels } from '@/lib/format/bytes'
import type { ImageJob } from '../types'
import styles from './ImagePreview.module.css'

type Props = { readonly job: ImageJob }

export function ImagePreview({ job }: Props) {
  const dimensoes = job.inspection

  return (
    <figure className={styles.envolvente}>
      <div className={styles.palco}>
        {job.preview ? (
          <img
            src={job.preview.url}
            alt={`Pré-visualização de ${job.sourceName}`}
            width={job.preview.width}
            height={job.preview.height}
            className={styles.imagem}
          />
        ) : (
          <p className={styles.semPreview}>
            {job.status === 'error'
              ? 'Sem pré-visualização.'
              : 'A preparar pré-visualização...'}
          </p>
        )}
      </div>

      {dimensoes ? (
        <figcaption className={styles.legenda}>
          <span className="numerico">
            {formatarDimensoes(dimensoes.width, dimensoes.height)}
          </span>
          <span className={styles.separador} aria-hidden="true">
            /
          </span>
          <span className="numerico">
            {formatarMegapixels(dimensoes.width, dimensoes.height)}
          </span>
        </figcaption>
      ) : null}
    </figure>
  )
}
