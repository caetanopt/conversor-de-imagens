/**
 * Geometria do redimensionamento.
 *
 * Vivia dentro do componente dos controlos, o que obrigava a camada de estado a
 * importar um componente para reutilizar uma funcao pura. E dominio, nao
 * interface.
 */
import type { ResizeOptions } from '../types'

/** Dimensoes que o motor vai produzir, para o utilizador ver antes de converter. */
export function calcularSaida(
  origem: { width: number; height: number },
  resize: ResizeOptions | null,
): { width: number; height: number } {
  if (!resize || (resize.width === null && resize.height === null)) return origem

  if (!resize.preserveAspectRatio) {
    return {
      width: resize.width ?? origem.width,
      height: resize.height ?? origem.height,
    }
  }

  // Caixa delimitadora: a imagem cabe dentro das dimensoes pedidas.
  const limiteLargura = resize.width ?? Number.POSITIVE_INFINITY
  const limiteAltura = resize.height ?? Number.POSITIVE_INFINITY
  let escala = Math.min(limiteLargura / origem.width, limiteAltura / origem.height)

  // Nao aumentar imagens pequenas, salvo pedido explicito.
  if (!resize.allowUpscale) escala = Math.min(escala, 1)

  return {
    width: Math.max(1, Math.round(origem.width * escala)),
    height: Math.max(1, Math.round(origem.height * escala)),
  }
}
