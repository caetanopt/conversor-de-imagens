'use client'

/**
 * O limite de dimensao do formato de destino, dito antes de converter.
 *
 * Hoje aplica-se ao ICO. Reduzir a imagem em silencio seria o mesmo erro de
 * destruir animacao em silencio: o utilizador tem de saber que o ficheiro nao
 * vai sair com as dimensoes que ve no ecra.
 */
import type { FormatId } from '@/config/formats'
import { avaliarLimiteDeDimensao } from '../state/dimensoes'
import type { ImageInspection, ResizeOptions } from '../types'
import { Notice, NoticeDetail, NoticeMessage } from './Notice'

type Props = {
  readonly inspection: ImageInspection | null
  readonly outputFormat: FormatId
  readonly resize: ResizeOptions | null
}

export function DimensionNotice({ inspection, outputFormat, resize }: Props) {
  const limite = avaliarLimiteDeDimensao(inspection, outputFormat, resize)
  if (!limite) return null

  return (
    <Notice tipo="perda">
      <NoticeMessage>
        Um ficheiro {limite.formato} não passa de {limite.limite} píxeis. A imagem vai ser
        reduzida para {limite.width} x {limite.height}.
      </NoticeMessage>
      <NoticeDetail>
        Acima desse tamanho o próprio ficheiro declararia {limite.limite} píxeis e os
        leitores que seguem a norma mostrariam a imagem errada.
      </NoticeDetail>
    </Notice>
  )
}
