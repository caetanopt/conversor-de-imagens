/**
 * Leituras derivadas do estado da fila.
 *
 * Funcoes puras, sem React, para o estado do lote ser testavel sem montar
 * componentes. O estado 'parcial' existe porque o CLAUDE.md, seccao 17.7,
 * exige um estado explicito para uma conversao em lote parcialmente concluida:
 * dizer "concluido" quando tres de dez falharam seria mentir.
 */
import type { ImageJob, JobErrorKind } from '../types'
import type { ConverterState } from './jobsReducer'

export type EstadoDoLote =
  | 'vazio'
  | 'pronto'
  | 'a-processar'
  | 'concluido'
  | 'parcial'
  | 'falhou'

export type ResumoDoLote = {
  readonly estado: EstadoDoLote
  readonly total: number
  readonly prontos: number
  readonly aProcessar: number
  readonly concluidos: number
  readonly comErro: number
  readonly cancelados: number
  /** Soma dos originais, apenas dos que ja concluiram, para a comparacao ser justa. */
  readonly bytesOriginais: number
  readonly bytesFinais: number
  /**
   * Quantos ficheiros a acao "converter tudo" vai processar.
   *
   * Sai do mesmo predicado que `convertiveis`, para o numero no botao nunca
   * divergir do que a acao faz.
   */
  readonly porConverter: number
  /** Trabalhos com resultado, na ordem da fila. Base do ZIP. */
  readonly concluidosComResultado: readonly ImageJob[]
}

export function resumirLote(estado: ConverterState): ResumoDoLote {
  const jobs = estado.jobs
  const porEstado = (s: ImageJob['status']) => jobs.filter((j) => j.status === s)

  const concluidos = porEstado('done')
  const comResultado = concluidos.filter((j) => j.result !== null)
  const comErro = porEstado('error')
  const cancelados = porEstado('cancelled')
  const aProcessar = porEstado('processing')
  const prontos = porEstado('ready')

  const bytesOriginais = comResultado.reduce((t, j) => t + j.sourceSize, 0)
  const bytesFinais = comResultado.reduce((t, j) => t + (j.result?.size ?? 0), 0)

  return {
    estado: derivarEstado({
      total: jobs.length,
      aProcessar: aProcessar.length,
      concluidos: concluidos.length,
      comErro: comErro.length,
      cancelados: cancelados.length,
      prontos: prontos.length,
    }),
    total: jobs.length,
    prontos: prontos.length,
    aProcessar: aProcessar.length,
    concluidos: concluidos.length,
    comErro: comErro.length,
    cancelados: cancelados.length,
    bytesOriginais,
    bytesFinais,
    porConverter: jobs.filter(podeConverter).length,
    concluidosComResultado: comResultado,
  }
}

function derivarEstado(c: {
  total: number
  aProcessar: number
  concluidos: number
  comErro: number
  cancelados: number
  prontos: number
}): EstadoDoLote {
  if (c.total === 0) return 'vazio'
  if (c.aProcessar > 0) return 'a-processar'

  const terminados = c.concluidos + c.comErro + c.cancelados
  // Ainda ha trabalho por fazer: nao e nem concluido nem falhado.
  if (terminados < c.total) return 'pronto'

  if (c.concluidos === c.total) return 'concluido'
  if (c.concluidos === 0) return 'falhou'
  return 'parcial'
}

export function jobSelecionado(estado: ConverterState): ImageJob | null {
  if (estado.selecionadoId === null) return estado.jobs[0] ?? null
  return estado.jobs.find((j) => j.id === estado.selecionadoId) ?? estado.jobs[0] ?? null
}

/**
 * Trabalhos que faz sentido converter agora.
 *
 * Um ficheiro cancelado volta a ser convertivel: cancelar nao e recusar. Um
 * ficheiro que nao passou a validacao nunca entra, porque nem chegou a ter um
 * formato de origem para converter.
 */
export function convertiveis(estado: ConverterState): readonly ImageJob[] {
  return estado.jobs.filter(podeConverter)
}

/**
 * Erros que nao mudam por se tentar de novo.
 *
 * Sao propriedades do ficheiro de entrada, nao da conversao: mudar o formato
 * de destino ou a qualidade nao torna um ficheiro corrompido legivel. Um erro
 * do motor, ao contrario, pode desaparecer com outras definicoes ou com menos
 * pixels, por isso mantem-se convertivel.
 */
const ERROS_SEM_RETENTATIVA: readonly JobErrorKind[] = [
  'ficheiro-invalido',
  'formato-nao-suportado',
  'demasiado-grande',
]

function podeConverter(job: ImageJob): boolean {
  if (job.sourceFormat === null) return false
  if (job.status === 'ready' || job.status === 'cancelled') return true
  if (job.status === 'error') {
    return job.error === null || !ERROS_SEM_RETENTATIVA.includes(job.error.kind)
  }
  return false
}

/** True quando ha mais do que um ficheiro, o que muda o que a interface mostra. */
export function ehLote(estado: ConverterState): boolean {
  return estado.jobs.length > 1
}
