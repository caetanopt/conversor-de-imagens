'use client'

/**
 * Indicador de trabalho em curso.
 *
 * Nao mostra percentagem por ficheiro de proposito. O magick-wasm nao expoe
 * progresso durante o encode e a chamada e sincrona dentro do worker, por isso
 * qualquer percentagem seria inventada. Mostramos em vez disso o que esta a
 * acontecer, em texto. CLAUDE.md, seccao 17.
 */
import styles from './ProgressIndicator.module.css'

type Props = {
  readonly etiqueta: string
  readonly detalhe?: string
}

export function ProgressIndicator({ etiqueta, detalhe }: Props) {
  return (
    <div className={styles.envolvente}>
      <span className={styles.barra} aria-hidden="true">
        <span className={styles.pulso} />
      </span>
      <span className={styles.texto}>
        {etiqueta}
        {detalhe ? <span className={styles.detalhe}>{detalhe}</span> : null}
      </span>
    </div>
  )
}
