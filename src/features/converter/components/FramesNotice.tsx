'use client'

/**
 * O que vai acontecer aos frames, dito antes de converter.
 *
 * Vive junto do seletor de formato de destino porque e a escolha do destino que
 * decide o resultado. Depois da conversao seria uma desculpa, nao um aviso.
 * CLAUDE.md, seccao 5.8.
 */
import type { FormatId } from '@/config/formats'
import { avaliarFrames, etiquetasDasAlternativas } from '../state/frames'
import type { ImageInspection } from '../types'
import { Notice, NoticeDetail, NoticeMessage } from './Notice'

type Props = {
  readonly inspection: ImageInspection | null
  readonly outputFormat: FormatId
}

export function FramesNotice({ inspection, outputFormat }: Props) {
  const noticia = avaliarFrames(inspection, outputFormat)
  if (!noticia) return null

  const alternativas = etiquetasDasAlternativas(noticia)

  return (
    <Notice tipo={noticia.tipo === 'reduzidos' ? 'perda' : 'informacao'}>
      <NoticeMessage>{noticia.mensagem}</NoticeMessage>
      {noticia.tipo === 'reduzidos' && alternativas ? (
        <NoticeDetail>
          Para manter tudo, escolha {alternativas} como formato de destino.
        </NoticeDetail>
      ) : null}
    </Notice>
  )
}
