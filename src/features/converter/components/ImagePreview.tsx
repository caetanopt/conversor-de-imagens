'use client'

/**
 * Pre-visualizacao local.
 *
 * A imagem mostrada e uma miniatura gerada no dispositivo, com dimensoes
 * limitadas. Nunca apontamos um `<img>` ao ficheiro original, para nao
 * descodificar 24 MP so para desenhar algumas centenas de pixels.
 */
import { formatarDimensoes, formatarMegapixels } from '@/lib/format/bytes'
import type { CropRect, Limites, ProporcaoId } from '../state/crop'
import type { ImageJob } from '../types'
import { CropOverlay } from './CropOverlay'
import styles from './ImagePreview.module.css'

type Props = {
  readonly job: ImageJob
  /** Presentes apenas quando o corte esta ligado. */
  readonly corte?: {
    readonly rect: CropRect
    readonly limites: Limites
    readonly aspect: ProporcaoId
    readonly onChange: (rect: CropRect) => void
    readonly disabled?: boolean
  }
}

export function ImagePreview({ job, corte }: Props) {
  const dimensoes = job.inspection

  return (
    <figure className={styles.envolvente}>
      <div className={styles.palco}>
        {job.preview ? (
          /*
           * O envolvente encolhe ate a imagem, e a sobreposicao do corte
           * posiciona-se contra ELE e nao contra o palco.
           *
           * Sem isto o corte apontava para a area cinzenta em volta: o palco
           * tem padding e centra a imagem, portanto os seus limites nao sao os
           * da imagem. `width: fit-content` faz o envolvente colar-se aos
           * pixeis desenhados, seja qual for a proporcao.
           */
          <div className={styles.envolveImagem}>
            <img
              src={job.preview.url}
              alt={`Pré-visualização de ${job.sourceName}`}
              width={job.preview.width}
              height={job.preview.height}
              className={styles.imagem}
            />
            {corte ? (
              <CropOverlay
                rect={corte.rect}
                limites={corte.limites}
                aspect={corte.aspect}
                onChange={corte.onChange}
                {...(corte.disabled === undefined ? {} : { disabled: corte.disabled })}
              />
            ) : null}
          </div>
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
          {corte ? (
            <>
              <span className={styles.separador} aria-hidden="true">
                /
              </span>
              <span className="numerico">
                corte {formatarDimensoes(corte.rect.width, corte.rect.height)}
              </span>
            </>
          ) : null}
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
