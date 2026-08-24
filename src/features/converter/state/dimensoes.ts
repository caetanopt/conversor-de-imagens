/**
 * Limite de dimensao imposto pelo formato de destino.
 *
 * Hoje existe um caso: o ICO. Acima de 256 px o ficheiro escrito declara 256 no
 * ICONDIRENTRY e passa a mentir sobre as proprias dimensoes, portanto a saida e
 * reduzida. Reduzir em silencio seria o mesmo erro de destruir animacao em
 * silencio, por isso a interface diz o tamanho que vai sair, antes de converter.
 *
 * Funcao pura, sem React.
 */
import { formatoPorId, type FormatId } from '@/config/formats'
import { calcularSaida } from './resize'
import type { ImageInspection, ResizeOptions } from '../types'

export type LimiteDeDimensao = {
  readonly limite: number
  readonly formato: string
  /** Dimensoes com que a imagem vai sair. */
  readonly width: number
  readonly height: number
}

/**
 * Devolve null quando nao ha nada a dizer: o formato nao tem limite, ou a
 * imagem ja cabe nele.
 */
export function avaliarLimiteDeDimensao(
  inspection: ImageInspection | null,
  outputFormat: FormatId,
  resize: ResizeOptions | null,
): LimiteDeDimensao | null {
  const formato = formatoPorId(outputFormat)
  const limite = formato.maxOutputDimension
  if (limite === null || !inspection) return null

  // O redimensionamento pedido pelo utilizador aplica-se primeiro: se ja pediu
  // 128 px, nao ha limite nenhum a anunciar.
  const pedido = resize ? calcularSaida(inspection, resize) : inspection
  if (pedido.width <= limite && pedido.height <= limite) return null

  const escala = limite / Math.max(pedido.width, pedido.height)
  return {
    limite,
    formato: formato.label,
    width: Math.max(1, Math.round(pedido.width * escala)),
    height: Math.max(1, Math.round(pedido.height * escala)),
  }
}
