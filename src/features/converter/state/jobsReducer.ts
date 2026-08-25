/**
 * Estado da fila de trabalhos.
 *
 * Reducer puro, sem store global. O estado e uma lista desde ja, mesmo que
 * nesta etapa a interface trate um ficheiro de cada vez: quando o lote entrar,
 * a forma do estado nao muda e nenhum componente precisa de ser reescrito.
 */
import { formatoPorId, type FormatId } from '@/config/formats'
import { PRESET_POR_DEFEITO, qualidadeDoPreset, type PresetId } from '@/config/presets'
import { novoId } from '@/lib/ids'
import { permiteEscolherSemPerda } from '@/lib/image-engine/options'
import type {
  ConversionMode,
  ConversionOptions,
  ConversionResult,
  ConversionStatus,
  ImageInspection,
  ImageJob,
  JobError,
  MetadataPolicy,
  PreviewRef,
  ResizeOptions,
} from '../types'

export type ConverterState = {
  readonly jobs: readonly ImageJob[]
  readonly mode: ConversionMode
  /**
   * Ficheiro cujas definicoes o painel edita.
   *
   * Com um ficheiro e sempre esse. Com varios, o utilizador escolhe na lista e
   * pode empurrar as definicoes para os restantes com "aplicar a todos".
   */
  readonly selecionadoId: string | null
}

export const estadoInicial: ConverterState = { jobs: [], mode: 'converter', selecionadoId: null }

export type ConverterAction =
  | { readonly type: 'adicionar'; readonly jobs: readonly ImageJob[] }
  | { readonly type: 'selecionar'; readonly id: string }
  | { readonly type: 'aplicar-a-todos'; readonly id: string }
  | { readonly type: 'inspecao'; readonly id: string; readonly inspection: ImageInspection }
  | { readonly type: 'preview'; readonly id: string; readonly preview: PreviewRef }
  | { readonly type: 'estado'; readonly id: string; readonly status: ConversionStatus }
  | { readonly type: 'resultado'; readonly id: string; readonly result: ConversionResult }
  | { readonly type: 'erro'; readonly id: string; readonly error: JobError }
  | { readonly type: 'avisos'; readonly id: string; readonly warnings: readonly string[] }
  | { readonly type: 'formato-de-saida'; readonly id: string; readonly outputFormat: FormatId }
  | { readonly type: 'qualidade'; readonly id: string; readonly quality: number }
  | { readonly type: 'preset'; readonly id: string; readonly preset: PresetId }
  | { readonly type: 'sem-perda'; readonly id: string; readonly lossless: boolean }
  | { readonly type: 'metadados'; readonly id: string; readonly metadata: MetadataPolicy }
  | { readonly type: 'resize'; readonly id: string; readonly resize: ResizeOptions | null }
  | { readonly type: 'modo'; readonly mode: ConversionMode }
  | { readonly type: 'remover'; readonly id: string }
  | { readonly type: 'limpar' }

export function jobsReducer(estado: ConverterState, acao: ConverterAction): ConverterState {
  switch (acao.type) {
    case 'adicionar': {
      if (acao.jobs.length === 0) return estado
      const jobs = [...estado.jobs, ...acao.jobs]
      return {
        ...estado,
        jobs,
        // O primeiro dos novos passa a ser o selecionado, para o painel mostrar
        // logo o que o utilizador acabou de adicionar.
        selecionadoId: acao.jobs[0]!.id,
      }
    }

    case 'selecionar':
      return estado.selecionadoId === acao.id ? estado : { ...estado, selecionadoId: acao.id }

    case 'aplicar-a-todos': {
      const origem = estado.jobs.find((job) => job.id === acao.id)
      if (!origem) return estado

      const jobs = estado.jobs.map((job) => {
        if (job.id === origem.id) return job

        // No modo de otimizacao o destino e imposto pela origem de cada
        // ficheiro, portanto o formato nao se copia: copia-se tudo o resto.
        const destino =
          estado.mode === 'otimizar'
            ? (formatoDeOtimizacao(job.sourceFormat) ?? job.options.outputFormat)
            : origem.options.outputFormat

        const options: ConversionOptions = {
          ...opcoesParaFormato({ ...origem.options }, destino),
          // O resize e as opcoes de metadados sao independentes do formato.
          resize: origem.options.resize,
          metadata: origem.options.metadata,
          autoOrient: origem.options.autoOrient,
        }

        const mudou =
          options.outputFormat !== job.options.outputFormat ||
          options.quality !== job.options.quality ||
          options.metadata !== job.options.metadata ||
          options.resize !== job.options.resize ||
          options.lossless !== job.options.lossless

        if (!mudou) return job

        return {
          ...job,
          status: job.status === 'done' || job.status === 'error' ? 'ready' : job.status,
          result: null,
          error: null,
          options,
        } satisfies ImageJob
      })

      return { ...estado, jobs }
    }

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

    case 'sem-perda':
      return atualizar(estado, acao.id, (job) => ({
        ...job,
        // Muda os bytes de saida, logo o resultado anterior deixa de
        // corresponder ao que esta selecionado.
        status: job.status === 'done' ? 'ready' : job.status,
        result: null,
        options: {
          ...job.options,
          lossless: acao.lossless,
          // Sem perda impoe a qualidade, portanto o preset deixa de descrever
          // o que vai acontecer.
          preset: acao.lossless ? null : (job.options.preset ?? PRESET_POR_DEFEITO),
        },
      }))

    case 'metadados':
      return atualizar(estado, acao.id, (job) => ({
        ...job,
        // Mudar a politica muda os bytes de saida, logo o resultado anterior
        // deixa de corresponder ao que esta selecionado.
        status: job.status === 'done' ? 'ready' : job.status,
        result: null,
        options: { ...job.options, metadata: acao.metadata },
      }))

    case 'resize':
      return atualizar(estado, acao.id, (job) => ({
        ...job,
        // Redimensionar muda os bytes de saida, logo o resultado anterior
        // deixa de corresponder ao que esta selecionado.
        status: job.status === 'done' ? 'ready' : job.status,
        result: null,
        options: { ...job.options, resize: acao.resize },
      }))

    case 'modo': {
      if (acao.mode === estado.mode) return estado

      // Otimizar e converter sao o mesmo pipeline: a unica diferenca e que em
      // 'otimizar' o formato de destino e imposto pelo formato de origem.
      // Nao ha um segundo caminho de codigo, so uma restricao na escolha.
      const jobs =
        acao.mode === 'otimizar'
          ? estado.jobs.map((job) => {
              const destino = formatoDeOtimizacao(job.sourceFormat)
              if (!destino || destino === job.options.outputFormat) return job
              return {
                ...job,
                status: job.status === 'done' || job.status === 'error' ? 'ready' : job.status,
                result: null,
                error: null,
                options: opcoesParaFormato(job.options, destino),
              } satisfies ImageJob
            })
          : estado.jobs

      return { ...estado, mode: acao.mode, jobs }
    }

    case 'remover': {
      const jobs = estado.jobs.filter((job) => job.id !== acao.id)
      // Se o removido era o selecionado, selecionamos o primeiro que sobra em
      // vez de deixar o painel sem contexto.
      const selecionadoId =
        estado.selecionadoId === acao.id ? (jobs[0]?.id ?? null) : estado.selecionadoId
      return { ...estado, jobs, selecionadoId }
    }

    case 'limpar':
      return { ...estado, jobs: [], selecionadoId: null }
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
    // Sem perda so se transporta para um formato onde seja uma escolha. Num
    // PNG a opcao nao existe, porque o formato ja e sem perda.
    lossless: permiteEscolherSemPerda(formato) ? anteriores.lossless : false,
  }
}

export function opcoesPorDefeito(outputFormat: FormatId): ConversionOptions {
  const formato = formatoPorId(outputFormat)
  return {
    outputFormat,
    quality: qualidadeDoPreset(PRESET_POR_DEFEITO, formato),
    preset: PRESET_POR_DEFEITO,
    // Remove EXIF, GPS, XMP e IPTC, e mantem o perfil de cor. Medido: sem o
    // perfil, uma imagem AdobeRGB muda de cor de forma visivel.
    // Ver docs/medicoes.md.
    metadata: 'preservar-cor',
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
    id: novoId(),
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

/**
 * Formato de destino no modo de otimizacao: o mesmo da origem.
 *
 * Devolve null quando otimizar no mesmo formato nao e possivel, o que acontece
 * se o motor souber ler mas nao escrever esse formato. HEIC e o caso obvio: o
 * motor descodifica e nao codifica, logo "otimizar um HEIC" nao existe.
 */
export function formatoDeOtimizacao(sourceFormat: FormatId | null): FormatId | null {
  if (!sourceFormat) return null
  const formato = formatoPorId(sourceFormat)
  if (!formato.canEncode || formato.release !== 'ativo') return null
  return formato.id
}

/** True quando o trabalho ja esta a produzir o mesmo formato da origem. */
export function eOtimizacao(job: ImageJob): boolean {
  return job.sourceFormat !== null && job.sourceFormat === job.options.outputFormat
}
