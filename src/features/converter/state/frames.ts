/**
 * O que vai acontecer aos frames desta conversao.
 *
 * O CLAUDE.md, seccao 5.8, e explicito: nunca eliminar animacao em silencio,
 * e informar ANTES da conversao. Isso exclui um aviso guardado no momento em
 * que o ficheiro entra, porque o formato de destino muda depois: um GIF que
 * ia para WebP mantem a animacao, e o mesmo GIF a ir para PNG perde-a. A
 * conclusao tem de ser recalculada a partir do par (origem, destino).
 *
 * Funcao pura, sem React, testavel sem montar componentes.
 */
import { FORMATOS, formatoPorId, type FormatId } from '@/config/formats'
import type { ImageInspection } from '../types'

export type NoticiaDeFrames = {
  /** 'preservados' quando o destino guarda os frames, 'reduzidos' quando nao. */
  readonly tipo: 'preservados' | 'reduzidos'
  readonly frames: number
  readonly mensagem: string
  /** Formatos de saida que preservariam estes frames. Vazio quando nao existe nenhum. */
  readonly alternativas: readonly FormatId[]
}

/**
 * Devolve null quando nao ha nada a dizer: um ficheiro de um frame, ou sem
 * inspecao feita. Um aviso que aparece sempre deixa de ser lido.
 */
export function avaliarFrames(
  inspection: ImageInspection | null,
  outputFormat: FormatId,
): NoticiaDeFrames | null {
  if (!inspection || inspection.frameCount <= 1) return null
  if (inspection.formatId === null) return null

  const origem = formatoPorId(inspection.formatId)
  const destino = formatoPorId(outputFormat)
  const frames = inspection.frameCount

  // Preservar so faz sentido quando os dois lados querem dizer a mesma coisa
  // com varios frames. A mesma regra que o motor aplica.
  const preserva = origem.multiFrame !== 'nenhum' && destino.multiFrame === origem.multiFrame

  const alternativas = FORMATOS.filter(
    (f) =>
      f.release === 'ativo' &&
      f.canEncode &&
      f.multiFrame === origem.multiFrame &&
      f.id !== destino.id,
  ).map((f) => f.id)

  if (preserva) {
    return {
      tipo: 'preservados',
      frames,
      mensagem: mensagemPreservado(origem.multiFrame, frames, destino.label),
      alternativas: [],
    }
  }

  return {
    tipo: 'reduzidos',
    frames,
    mensagem: mensagemReduzido(origem.multiFrame, frames, destino.label),
    alternativas,
  }
}

function mensagemPreservado(
  tipo: 'nenhum' | 'animacao' | 'tamanhos' | 'paginas',
  frames: number,
  destino: string,
): string {
  switch (tipo) {
    case 'animacao':
      return `Animação com ${frames} fotogramas. O formato ${destino} preserva a animação.`
    case 'tamanhos':
      return `Este ficheiro tem ${frames} tamanhos do mesmo ícone. Todos são mantidos.`
    case 'paginas':
      return `Este ficheiro tem ${frames} páginas. Todas são mantidas.`
    default:
      return ''
  }
}

function mensagemReduzido(
  tipo: 'nenhum' | 'animacao' | 'tamanhos' | 'paginas',
  frames: number,
  destino: string,
): string {
  switch (tipo) {
    case 'animacao':
      return (
        `Esta imagem é animada, com ${frames} fotogramas. O formato ${destino} guarda ` +
        `uma imagem só, por isso fica apenas o primeiro fotograma.`
      )
    case 'tamanhos':
      return (
        `Este ficheiro tem ${frames} tamanhos do mesmo ícone. Em ${destino} fica ` +
        `apenas o maior.`
      )
    case 'paginas':
      return (
        `Este ficheiro tem ${frames} páginas. Em ${destino} fica apenas a primeira.`
      )
    default:
      return `Este ficheiro tem ${frames} fotogramas e o formato ${destino} guarda apenas um.`
  }
}

/** Etiquetas dos formatos que preservariam os frames, para a sugestao na interface. */
export function etiquetasDasAlternativas(noticia: NoticiaDeFrames): string {
  return noticia.alternativas.map((id) => formatoPorId(id).label).join(' ou ')
}
