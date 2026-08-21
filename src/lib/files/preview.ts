/**
 * Miniaturas locais.
 *
 * Nunca descodificamos a imagem inteira para mostrar uma pre-visualizacao.
 * Uma imagem de 24 MP em RGBA ocupa cerca de 96 MB descomprimida, e um
 * `<img src=objectURL>` sobre o ficheiro original paga esse custo so para
 * desenhar algumas centenas de pixels no ecra. CLAUDE.md, seccao 19.5.
 *
 * As dimensoes vem de `inspect`, que le cabecalhos sem descodificar, por isso
 * conseguimos pedir ao browser exatamente o tamanho de que precisamos.
 */
import { formatoPorId, type FormatId } from '@/config/formats'
import { LIMITES } from '@/config/limits'
import type { PreviewRef } from '@/features/converter/types'
import { criarObjectUrl } from './objectUrls'

export type DimensoesOrigem = { readonly width: number; readonly height: number }

/**
 * Devolve null quando o browser nao sabe descodificar o formato, por exemplo
 * TIFF ou HEIC. Nesse caso a miniatura tera de vir do motor, o que fica para
 * a etapa em que esses formatos sao ativados.
 */
export async function criarPreview(
  file: File,
  formatId: FormatId,
  origem: DimensoesOrigem,
): Promise<PreviewRef | null> {
  if (!formatoPorId(formatId).browserDecodable) return null
  if (typeof createImageBitmap !== 'function') return null

  const alvo = calcularAlvo(origem, LIMITES.larguraPreview)
  const bitmap = await criarBitmap(file, alvo)

  try {
    const blob = await desenharParaBlob(bitmap, alvo)
    if (!blob) return null
    return { url: criarObjectUrl(blob), width: alvo.width, height: alvo.height }
  } finally {
    // Libertar os pixels descodificados assim que o blob existe.
    bitmap.close()
  }
}

/** Nunca aumenta imagens pequenas: uma miniatura esticada nao ajuda ninguem. */
export function calcularAlvo(origem: DimensoesOrigem, larguraMaxima: number): DimensoesOrigem {
  if (origem.width <= larguraMaxima) return origem
  const escala = larguraMaxima / origem.width
  return {
    width: larguraMaxima,
    height: Math.max(1, Math.round(origem.height * escala)),
  }
}

async function criarBitmap(file: File, alvo: DimensoesOrigem): Promise<ImageBitmap> {
  try {
    // Caminho preferido: o browser descodifica ja na dimensao pedida, sem
    // materializar a imagem completa em memoria.
    return await createImageBitmap(file, {
      resizeWidth: alvo.width,
      resizeHeight: alvo.height,
      resizeQuality: 'medium',
    })
  } catch {
    // Browsers que ignoram as opcoes de redimensionamento. Custa mais memoria
    // por um instante, mas o resultado visual e o mesmo.
    return createImageBitmap(file)
  }
}

async function desenharParaBlob(
  bitmap: ImageBitmap,
  alvo: DimensoesOrigem,
): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  canvas.width = alvo.width
  canvas.height = alvo.height

  const contexto = canvas.getContext('2d')
  if (!contexto) return null
  contexto.drawImage(bitmap, 0, 0, alvo.width, alvo.height)

  return new Promise<Blob | null>((resolve) => {
    // WebP para a miniatura ser leve. Browsers sem encode de WebP em canvas
    // devolvem PNG automaticamente, o que continua correto.
    canvas.toBlob((blob) => resolve(blob), 'image/webp', 0.8)
  })
}
