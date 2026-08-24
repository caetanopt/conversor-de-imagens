'use client'

/**
 * O que vai acontecer aos frames, dito antes de converter.
 *
 * Vive junto do seletor de formato de destino porque e a escolha do destino que
 * decide o resultado. Depois da conversao seria uma desculpa, nao um aviso.
 * CLAUDE.md, seccao 5.8.
 */
import { avaliarFrames, etiquetasDasAlternativas } from '../state/frames'
import type { ImageInspection } from '../types'
import type { FormatId } from '@/config/formats'
import styles from './FramesNotice.module.css'

type Props = {
  readonly inspection: ImageInspection | null
  readonly outputFormat: FormatId
}

export function FramesNotice({ inspection, outputFormat }: Props) {
  const noticia = avaliarFrames(inspection, outputFormat)
  if (!noticia) return null

  const alternativas = etiquetasDasAlternativas(noticia)

  return (
    <div className={noticia.tipo === 'reduzidos' ? styles.perda : styles.mantido}>
      <p className={styles.mensagem}>{noticia.mensagem}</p>
      {noticia.tipo === 'reduzidos' && alternativas ? (
        <p className={styles.alternativa}>
          Para manter tudo, escolha {alternativas} como formato de destino.
        </p>
      ) : null}
    </div>
  )
}
