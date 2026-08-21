/**
 * Estado da fila de trabalhos.
 *
 * Reducer puro, sem store global. O estado e uma lista desde ja, mesmo que
 * nesta etapa a interface trate um ficheiro de cada vez: quando o lote entrar,
 * a forma do estado nao muda e nenhum componente precisa de ser reescrito.
 */
import { formatoPorId, type FormatId } from '@/config/formats'
import { PRESET_POR_DEFEITO, qualidadeDoPreset, type PresetId } from '@/config/presets'
import type {
  ConversionMode,
  ConversionOptions,
  ConversionResult,
  ConversionStatus,
  ImageInspection,
  ImageJob,
  JobError,
  PreviewRef,
} from '../types'

export type ConverterState = {
  readonly jobs: readonly ImageJob[]
  readonly mode: ConversionMode
}

export const estadoInicial: ConverterState = { jobs: [], mode: 'converter' }

export type ConverterAction =
  | { readonly type: 'adicionar'; readonly job: ImageJob }
  | { readonly type: 'inspecao'; readonly id: string; readonly inspection: ImageInspection }
  | { readonly type: 'preview'; readonly id: string; readonly preview: PreviewRef }
  | { readonly type: 'estado'; readonly id: string; readonly status: ConversionStatus }
  | { readonly type: 'resultado'; readonly id: string; readonly result: ConversionResult }
  | { readonly type: 'erro'; readonly id: string; readonly error: JobError }
  | { readonly type: 'avisos'; readonly id: string; readonly warnings: readonly string[] }
  | { readonly type: 'formato-de-saida'; readonly id: string; readonly outputFormat: FormatId }
  | { readonly type: 'qualidade'; readonly id: string; readonly quality: number }
  | { readonly type: 'preset'; readonly id: string; readonly preset: PresetId }
  | { readonly type: 'modo'; readonly mode: ConversionMode }
  | { readonly type: 'remover'; readonly id: string }
  | { readonly type: 'limpar' }

export function jobsReducer(estado: ConverterState, acao: ConverterAction): ConverterState {
  switch (acao.type) {
    case 'adicionar':
      return { ...estado, jobs: [...estado.jobs, acao.job] }

    case 'inspecao':
      return atualizar(estado, acao.id, (job) => ({
        ...job,
        inspection: acao.inspection,
        // A assinatura do ficheiro manda, mas se o motor identificar outro
        // formato preferimos o motor, porque foi ele que leu a imagem.
        sourceFormat: acao.inspection.formatId ?? job.sourceFormat,
      }))

    case 'preview':
      return atualizar(estado, acao.id, (job) => ({ ...job, preview: acao.preview }))

    case 'estado':
      return atualizar(estado, acao.id, (job) => ({
        ...job,
        status: acao.status,
        // Voltar a processar limpa o erro anterior, senao ficaria visivel
        // uma mensagem de uma tentativa que ja nao existe.
        error: acao.status === 'processing' ? null : job.error,
      }))

    case 'resultado':
      return atualizar(estado, acao.id, (job) => ({
        ...job,
        status: 'done',
        result: acao.result,
        error: null,
      }))

    case 'erro':
      return atualizar(estado, acao.id, (job) => ({
        ...job,
        status: 'error',
        error: acao.error,
        result: null,
      }))

    case 'avisos':
      return atualizar(estado, acao.id, (job) => ({
        ...job,
        warnings: [...job.warnings, ...acao.warnings],
      }))

    case 'formato-de-saida':
      return atualizar(estado, acao.id, (job) => ({
        ...job,
        // Mudar o destino invalida o resultado anterior, que era de outro formato.
        status: job.status === 'done' || job.status === 'error' ? 'ready' : job.status,
        result: null,
        error: null,
        options: opcoesParaFormato(job.options, acao.outputFormat),
      }))

    case 'qualidade':
      return atualizar(estado, acao.id, (job) => ({
        ...job,
        status: job.status === 'done' ? 'ready' : job.status,
        result: null,
        options: { ...job.options, quality: acao.quality, preset: null },
      }))

    case 'preset':
      return atualizar(estado, acao.id, (job) => ({
        ...job,
        status: job.status === 'done' ? 'ready' : job.status,
        result: null,
        options: {
          ...job.options,
          preset: acao.preset,
          quality: qualidadeDoPreset(acao.preset, formatoPorId(job.options.outputFormat)),
        },
      }))

    case 'modo':
      return { ...estado, mode: acao.mode }

    case 'remover':
      return { ...estado, jobs: estado.jobs.filter((job) => job.id !== acao.id) }

    case 'limpar':
      return { ...estado, jobs: [] }
  }
}

function atualizar(
  estado: ConverterState,
  id: string,
  transformar: (job: ImageJob) => ImageJob,
): ConverterState {
  let mudou = false
  const jobs = estado.jobs.map((job) => {
    if (job.id !== id) return job
    mudou = true
    return transformar(job)
  })
  // Devolver o mesmo objeto quando nada muda evita renders desnecessarios.
  return mudou ? { ...estado, jobs } : estado
}

/**
 * Recalcula as opcoes quando o formato de destino muda.
 * Um PNG nao pode ficar com uma qualidade herdada de um JPEG: mostrar um
 * controlo sem efeito e exatamente o que o CLAUDE.md proibe na seccao 11.
 */
export function opcoesParaFormato(
  anteriores: ConversionOptions,
  outputFormat: FormatId,
): ConversionOptions {
  const formato = formatoPorId(outputFormat)
  const preset = anteriores.preset ?? PRESET_POR_DEFEITO

  return {
    ...anteriores,
    outputFormat,
    quality: qualidadeDoPreset(preset, formato),
    preset,
    lossless: formato.supportsLossless ? anteriores.lossless : false,
  }
}

export function opcoesPorDefeito(outputFormat: FormatId): ConversionOptions {
  const formato = formatoPorId(outputFormat)
  return {
    outputFormat,
    quality: qualidadeDoPreset(PRESET_POR_DEFEITO, formato),
    preset: PRESET_POR_DEFEITO,
    // Remover metadados e o comportamento recomendado: menos bytes e menos
    // dados pessoais no ficheiro que o utilizador vai partilhar.
    stripMetadata: true,
    autoOrient: true,
    lossless: false,
    resize: null,
  }
}

/**
 * `sourceFormat` pode ser null quando a validacao falhou: nesse caso ainda
 * criamos o trabalho, para o utilizador ver qual foi o ficheiro rejeitado e
 * porque. Um erro sem contexto e pior do que nenhum.
 */
export function criarJob(
  file: File,
  sourceFormat: FormatId | null,
  outputFormat: FormatId,
): ImageJob {
  return {
    // ID gerado, nunca o nome do ficheiro. CLAUDE.md, seccao 10.
    id: crypto.randomUUID(),
    file,
    sourceName: file.name,
    sourceSize: file.size,
    sourceFormat,
    inspection: null,
    preview: null,
    options: opcoesPorDefeito(outputFormat),
    status: 'ready',
    result: null,
    error: null,
    warnings: [],
  }
}

/** Destino sensato: WebP a partir de qualquer coisa, JPG a partir de WebP. */
export function destinoSugerido(sourceFormat: FormatId | null): FormatId {
  return sourceFormat === 'webp' ? 'jpeg' : 'webp'
}
