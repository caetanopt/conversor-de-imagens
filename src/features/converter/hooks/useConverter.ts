'use client'

/**
 * Orquestracao do fluxo de conversao.
 *
 * Junta quatro coisas e nada mais: o reducer da fila, o cliente do motor, o
 * ciclo de vida dos object URLs e o empacotamento do ZIP. Nao sabe nada sobre
 * ImageMagick.
 *
 * O lote nao introduziu um segundo caminho de codigo. Converter um ficheiro e
 * converter trinta usam a mesma funcao por trabalho; a diferenca esta em quem
 * a chama e em quem conta os resultados. A concorrencia real e imposta pelo
 * WorkerPool, nao aqui.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'

import { formatoPorId, type FormatId } from '@/config/formats'
import { LIMITES } from '@/config/limits'
import type { PresetId } from '@/config/presets'
import { EngineClient, ErroDoMotor, type ContextoDaTarefa } from '@/lib/image-engine/client/EngineClient'
import { registarConversao, registarFalha } from '@/lib/dev/metrics'
import { descarregarBlob } from '@/lib/download/saveBlob'
import { trocarExtensao } from '@/lib/download/fileNames'
import { criarZip, nomeDoZip } from '@/lib/download/zipResults'
import { revogarObjectUrl, revogarTodosOsObjectUrls } from '@/lib/files/objectUrls'
import { criarPreview, previewDeBlob } from '@/lib/files/preview'
import { lerCabecalho } from '@/lib/files/readFile'
import { validarFicheiro, validarInspecao } from '@/lib/validation/validateFile'
import {
  criarJob,
  destinoSugerido,
  estadoInicial,
  formatoDeOtimizacao,
  jobsReducer,
} from '../state/jobsReducer'
import { convertiveis, jobSelecionado, resumirLote } from '../state/selectors'
import type {
  ConversionMode,
  ImageInspection,
  ImageJob,
  JobError,
  MetadataPolicy,
  PreviewRef,
  ResizeOptions,
} from '../types'

/**
 * Estado do arranque do motor, exposto a interface de proposito.
 * Sao 5,1 MB comprimidos a descarregar, e o utilizador tem direito a saber
 * que e isso que esta a acontecer em vez de ver um spinner sem explicacao.
 */
export type EstadoDoMotor = 'inativo' | 'a-preparar' | 'pronto' | 'indisponivel'

/** Desfecho de um trabalho. Contado no fim do lote, sem depender do render. */
type Desfecho = 'ok' | 'erro' | 'cancelado'

export function useConverter() {
  const [estado, dispatch] = useReducer(jobsReducer, estadoInicial)
  const [estadoDoMotor, setEstadoDoMotor] = useState<EstadoDoMotor>('inativo')
  const [anuncio, setAnuncio] = useState('')
  const [aAnalisar, setAAnalisar] = useState(false)
  const [aEmpacotar, setAEmpacotar] = useState(false)

  const clienteRef = useRef<EngineClient | null>(null)
  const montadoRef = useRef(true)

  /**
   * O lote e assincrono e demorado. Um closure sobre `estado` ficava velho a
   * meio de trinta conversoes, e a alternativa era recriar todas as funcoes a
   * cada dispatch. As funcoes assincronas leem daqui.
   */
  const estadoRef = useRef(estado)
  estadoRef.current = estado

  const cliente = useCallback((): EngineClient => {
    clienteRef.current ??= new EngineClient()
    return clienteRef.current
  }, [])

  useEffect(() => {
    montadoRef.current = true
    return () => {
      montadoRef.current = false
      clienteRef.current?.dispose()
      clienteRef.current = null
      // Rede de seguranca: nenhum object URL sobrevive a desmontagem.
      revogarTodosOsObjectUrls()
    }
  }, [])

  const prepararMotor = useCallback(async (): Promise<boolean> => {
    try {
      setEstadoDoMotor((atual) => (atual === 'pronto' ? atual : 'a-preparar'))
      await cliente().prepare()
      if (!montadoRef.current) return false
      setEstadoDoMotor('pronto')
      return true
    } catch {
      if (montadoRef.current) setEstadoDoMotor('indisponivel')
      return false
    }
  }, [cliente])

  /** Dimensoes e miniatura de um trabalho. Precisa do motor pronto. */
  const analisar = useCallback(
    async (job: ImageJob): Promise<void> => {
      if (!job.sourceFormat) return

      try {
        const inspecao = await cliente().inspect(job.file, {
          chave: job.id,
          magickFormatHint: hintDoFormato(job.sourceFormat),
        })
        if (!montadoRef.current) return

        const validacao = validarInspecao(inspecao)
        if (!validacao.ok) {
          dispatch({ type: 'erro', id: job.id, error: validacao.error })
          return
        }

        dispatch({ type: 'inspecao', id: job.id, inspection: inspecao })
        if (validacao.warnings.length > 0) {
          dispatch({ type: 'avisos', id: job.id, warnings: validacao.warnings })
        }

        const preview = await previsualizar(cliente(), job, inspecao)

        if (!montadoRef.current) {
          revogarObjectUrl(preview?.url)
          return
        }
        if (preview) dispatch({ type: 'preview', id: job.id, preview })
      } catch (erro) {
        if (!montadoRef.current) return
        dispatch({ type: 'erro', id: job.id, error: erroDeDominio(erro) })
      }
    },
    [cliente],
  )

  const adicionarFicheiros = useCallback(
    async (ficheiros: readonly File[]): Promise<void> => {
      if (ficheiros.length === 0) return

      const espaco = Math.max(0, LIMITES.maxFicheiros - estadoRef.current.jobs.length)
      const aceites = ficheiros.slice(0, espaco)
      const semEspaco = ficheiros.length - aceites.length

      if (aceites.length === 0) {
        setAnuncio(
          `Já tem ${LIMITES.maxFicheiros} ficheiros na fila, que é o limite. ` +
            'Remova alguns antes de adicionar outros.',
        )
        return
      }

      setAAnalisar(true)
      try {
        const modo = estadoRef.current.mode

        // A leitura do cabecalho sao 32 bytes por ficheiro, portanto em
        // paralelo nao custa nada e evita esperar em serie por trinta fatias.
        const validados = await Promise.all(
          aceites.map(async (file) => ({
            file,
            validacao: validarFicheiro(file, await lerCabecalho(file)),
          })),
        )
        if (!montadoRef.current) return

        const novos = validados.map(({ file, validacao }) =>
          validacao.ok
            ? criarJob(file, validacao.formatId, destinoParaModo(modo, validacao.formatId))
            : // Um ficheiro rejeitado continua a entrar na fila, para o
              // utilizador ver qual foi e porque. CLAUDE.md, seccao 20.6.
              criarJob(file, null, 'webp'),
        )

        // Um unico dispatch: a lista aparece de uma vez, sem trinta renders.
        dispatch({ type: 'adicionar', jobs: novos })

        for (const [indice, { validacao }] of validados.entries()) {
          const job = novos[indice]!
          if (!validacao.ok) {
            dispatch({ type: 'erro', id: job.id, error: validacao.error })
          } else if (validacao.warnings.length > 0) {
            dispatch({ type: 'avisos', id: job.id, warnings: validacao.warnings })
          }
        }

        const validos = novos.filter((_, indice) => validados[indice]!.validacao.ok)
        setAnuncio(anuncioDeEntrada(validos.length, novos.length - validos.length, semEspaco))

        if (validos.length === 0) return

        if (!(await prepararMotor())) {
          if (!montadoRef.current) return
          for (const job of validos) {
            dispatch({ type: 'erro', id: job.id, error: ERRO_MOTOR_INDISPONIVEL })
          }
          return
        }

        // Sequencial de proposito: cada inspecao le o ficheiro inteiro para
        // memoria antes de o transferir para o worker. Trinta em paralelo
        // seriam trinta ficheiros em memoria ao mesmo tempo.
        for (const job of validos) {
          if (!montadoRef.current) return
          await analisar(job)
        }
      } finally {
        if (montadoRef.current) setAAnalisar(false)
      }
    },
    [analisar, prepararMotor],
  )

  /** Converte um trabalho e devolve o desfecho, sem depender do render. */
  const converterJob = useCallback(
    async (job: ImageJob): Promise<Desfecho> => {
      // Cada frame e uma imagem a codificar. Um GIF de 20 frames a 640x480 sao
      // 6,1 MP de trabalho, nao 0,3 MP. Medido: 2,8 s de encode.
      const pixels = job.inspection
        ? job.inspection.width * job.inspection.height * Math.max(1, job.inspection.frameCount)
        : null
      const contexto: ContextoDaTarefa = {
        chave: job.id,
        ...(pixels === null ? {} : { pixels }),
        magickFormatHint: hintDoFormato(job.sourceFormat),
        // O estado passa a 'processing' quando a tarefa arranca de facto, nao
        // quando entra na fila. Com concorrencia 2 e trinta ficheiros, a
        // alternativa era mostrar trinta conversoes a decorrer.
        onInicio: () => {
          if (montadoRef.current) dispatch({ type: 'estado', id: job.id, status: 'processing' })
        },
      }

      try {
        const resultado = await cliente().convert(job.file, job.options, contexto)
        if (!montadoRef.current) return 'ok'

        dispatch({
          type: 'resultado',
          id: job.id,
          result: {
            blob: resultado.blob,
            size: resultado.size,
            width: resultado.width,
            height: resultado.height,
            formatId: job.options.outputFormat,
            durationMs: resultado.durationMs,
            decodeMs: resultado.decodeMs,
            encodeMs: resultado.encodeMs,
            profilesKept: resultado.profilesKept,
            frameCount: resultado.frameCount,
            outputFrameCount: resultado.outputFrameCount,
          },
        })

        registarConversao({
          formatoOrigem: job.sourceFormat ?? 'desconhecido',
          formatoDestino: job.options.outputFormat,
          pixels: resultado.width * resultado.height,
          bytesOrigem: job.sourceSize,
          bytesDestino: resultado.size,
          duracaoMs: resultado.durationMs,
        })
        return 'ok'
      } catch (erro) {
        const dominio = erroDeDominio(erro)

        // Cancelar nao e falhar. O worker e terminado nos dois casos, mas o
        // trabalho fica em 'cancelled' e pode ser repetido.
        if (dominio.kind === 'cancelado') {
          if (montadoRef.current) dispatch({ type: 'estado', id: job.id, status: 'cancelled' })
          return 'cancelado'
        }

        if (montadoRef.current) dispatch({ type: 'erro', id: job.id, error: dominio })
        registarFalha(job.options.outputFormat, dominio.kind, dominio.detail)
        return 'erro'
      }
    },
    [cliente],
  )

  const converter = useCallback(
    async (id: string): Promise<void> => {
      const job = estadoRef.current.jobs.find((j) => j.id === id)
      if (!job) return

      setAnuncio('A converter.')
      const desfecho = await converterJob(job)
      if (!montadoRef.current) return

      if (desfecho === 'ok') setAnuncio('Conversão concluída.')
      else if (desfecho === 'erro') setAnuncio('A conversão falhou.')
    },
    [converterJob],
  )

  const converterTodos = useCallback(async (): Promise<void> => {
    const alvos = convertiveis(estadoRef.current)
    if (alvos.length === 0) return

    if (!(await prepararMotor())) {
      if (!montadoRef.current) return
      for (const job of alvos) dispatch({ type: 'erro', id: job.id, error: ERRO_MOTOR_INDISPONIVEL })
      return
    }

    setAnuncio(
      alvos.length === 1 ? 'A converter.' : `A converter ${alvos.length} imagens no seu dispositivo.`,
    )

    // Todos entram na fila do pool ao mesmo tempo; o pool e que decide quantos
    // correm. Contar os desfechos e mais fiavel do que ler o estado a seguir,
    // porque os ultimos dispatches ainda podem nao ter sido aplicados.
    const desfechos = await Promise.all(alvos.map((job) => converterJob(job)))
    if (!montadoRef.current) return

    setAnuncio(anuncioDeLote(desfechos))
  }, [converterJob, prepararMotor])

  const cancelar = useCallback((id?: string) => {
    if (id === undefined) {
      clienteRef.current?.cancel()
      setAnuncio('Conversões canceladas.')
      return
    }
    clienteRef.current?.cancelarTrabalho(id)
    setAnuncio('Conversão cancelada.')
  }, [])

  const remover = useCallback((id: string) => {
    const job = estadoRef.current.jobs.find((j) => j.id === id)
    clienteRef.current?.cancelarTrabalho(id)
    revogarObjectUrl(job?.preview?.url)
    dispatch({ type: 'remover', id })
    setAnuncio('Imagem removida.')
  }, [])

  const removerTodos = useCallback(() => {
    clienteRef.current?.cancel()
    for (const job of estadoRef.current.jobs) revogarObjectUrl(job.preview?.url)
    dispatch({ type: 'limpar' })
    setAnuncio('Fila limpa.')
  }, [])

  const descarregar = useCallback((job: ImageJob) => {
    if (!job.result) return
    descarregarBlob(job.result.blob, trocarExtensao(job.sourceName, job.result.formatId))
  }, [])

  const descarregarTodos = useCallback(async (): Promise<void> => {
    const entradas = resumirLote(estadoRef.current)
      .concluidosComResultado.map((job) =>
        job.result === null
          ? null
          : { nome: trocarExtensao(job.sourceName, job.result.formatId), blob: job.result.blob },
      )
      .filter((entrada): entrada is { nome: string; blob: Blob } => entrada !== null)

    if (entradas.length === 0) return

    setAEmpacotar(true)
    try {
      const { blob } = await criarZip(entradas)
      if (!montadoRef.current) return
      descarregarBlob(blob, nomeDoZip(entradas.length))
      setAnuncio(`ZIP com ${entradas.length} ${entradas.length === 1 ? 'imagem' : 'imagens'} criado no seu dispositivo.`)
    } catch {
      if (montadoRef.current) setAnuncio('Não foi possível criar o ficheiro ZIP.')
    } finally {
      if (montadoRef.current) setAEmpacotar(false)
    }
  }, [])

  const selecionar = useCallback((id: string) => {
    dispatch({ type: 'selecionar', id })
  }, [])

  const aplicarATodos = useCallback((id: string) => {
    dispatch({ type: 'aplicar-a-todos', id })
    setAnuncio('Definições aplicadas a todos os ficheiros.')
  }, [])

  const definirFormatoDeSaida = useCallback((id: string, outputFormat: FormatId) => {
    dispatch({ type: 'formato-de-saida', id, outputFormat })
  }, [])

  const definirQualidade = useCallback((id: string, quality: number) => {
    dispatch({ type: 'qualidade', id, quality })
  }, [])

  const definirPreset = useCallback((id: string, preset: PresetId) => {
    dispatch({ type: 'preset', id, preset })
  }, [])

  const definirSemPerda = useCallback((id: string, lossless: boolean) => {
    dispatch({ type: 'sem-perda', id, lossless })
  }, [])

  const definirMetadados = useCallback((id: string, metadata: MetadataPolicy) => {
    dispatch({ type: 'metadados', id, metadata })
  }, [])

  const definirResize = useCallback((id: string, resize: ResizeOptions | null) => {
    dispatch({ type: 'resize', id, resize })
  }, [])

  const definirModo = useCallback((mode: ConversionMode) => {
    dispatch({ type: 'modo', mode })
  }, [])

  return {
    jobs: estado.jobs,
    selecionado: jobSelecionado(estado),
    resumo: resumirLote(estado),
    mode: estado.mode,
    estadoDoMotor,
    aAnalisar,
    aEmpacotar,
    anuncio,
    adicionarFicheiros,
    converter,
    converterTodos,
    cancelar,
    remover,
    removerTodos,
    descarregar,
    descarregarTodos,
    selecionar,
    aplicarATodos,
    definirFormatoDeSaida,
    definirQualidade,
    definirPreset,
    definirSemPerda,
    definirMetadados,
    definirResize,
    definirModo,
  }
}

/**
 * Pre-visualizacao, por dois caminhos e sem nunca fazer falhar o trabalho.
 *
 * Primeiro o browser, que e mais rapido e nao ocupa o motor. Depois o motor,
 * para os formatos que o browser nao descodifica.
 *
 * Nenhuma falha aqui e um erro do trabalho. Sem miniatura a conversao continua
 * a funcionar, e tratar isto como erro impediria o utilizador de converter um
 * ficheiro que o motor le perfeitamente. Isto tambem torna `browserDecodable`
 * uma pista de desempenho e nao uma afirmacao de correcao: se um browser que
 * nao testamos recusar um formato que marcamos como descodificavel, a miniatura
 * passa a vir do motor em vez de o ficheiro ser recusado.
 */
async function previsualizar(
  cliente: EngineClient,
  job: ImageJob,
  inspecao: ImageInspection,
): Promise<PreviewRef | null> {
  if (!job.sourceFormat) return null

  try {
    const doBrowser = await criarPreview(job.file, job.sourceFormat, inspecao)
    if (doBrowser) return doBrowser
  } catch {
    // O browser disse que sabia e nao sabia. Segue para o motor.
  }

  try {
    const m = await cliente.miniatura(job.file, {
      chave: job.id,
      magickFormatHint: hintDoFormato(job.sourceFormat),
    })
    return previewDeBlob(m.blob, m.width, m.height)
  } catch {
    return null
  }
}

/**
 * Formato a declarar ao motor, ou null quando ele o descobre sozinho.
 *
 * So se forca onde e preciso. Um ICO nao se identifica pelos proprios bytes de
 * forma fiavel e o motor recusa-o sem formato explicito; nos restantes, deixar
 * o motor decidir mantem a divergencia entre a nossa deteccao e a dele
 * visivel, o que e informacao e nao um problema.
 */
function hintDoFormato(sourceFormat: FormatId | null): string | null {
  if (!sourceFormat) return null
  const formato = formatoPorId(sourceFormat)
  return formato.requiresFormatHint ? formato.magickFormat : null
}

const ERRO_MOTOR_INDISPONIVEL: JobError = {
  kind: 'motor-indisponivel',
  message:
    'Não foi possível preparar o motor de conversão. Verifique a ligação e recarregue a página.',
}

/**
 * Destino de um ficheiro novo, respeitando o modo em curso.
 *
 * Em 'otimizar' o destino e o formato de origem. Quando esse formato nao pode
 * ser escrito pelo motor, cai no destino sugerido em vez de ficar preso.
 */
function destinoParaModo(modo: ConversionMode, sourceFormat: FormatId): FormatId {
  if (modo === 'otimizar') return formatoDeOtimizacao(sourceFormat) ?? destinoSugerido(sourceFormat)
  return destinoSugerido(sourceFormat)
}

function anuncioDeEntrada(validos: number, invalidos: number, semEspaco: number): string {
  const partes: string[] = []

  if (validos === 1) partes.push('1 imagem carregada.')
  else if (validos > 1) partes.push(`${validos} imagens carregadas.`)

  if (invalidos === 1) partes.push('1 ficheiro foi rejeitado.')
  else if (invalidos > 1) partes.push(`${invalidos} ficheiros foram rejeitados.`)

  if (semEspaco > 0) {
    partes.push(
      `${semEspaco} ${semEspaco === 1 ? 'ficheiro ficou' : 'ficheiros ficaram'} de fora: ` +
        `o limite é ${LIMITES.maxFicheiros}.`,
    )
  }

  return partes.join(' ')
}

/**
 * Resumo honesto do lote.
 *
 * Um lote com falhas nao diz "concluido". CLAUDE.md, seccao 17.7 exige um
 * estado explicito para a conversao parcialmente concluida.
 */
function anuncioDeLote(desfechos: readonly Desfecho[]): string {
  const ok = desfechos.filter((d) => d === 'ok').length
  const erros = desfechos.filter((d) => d === 'erro').length
  const cancelados = desfechos.filter((d) => d === 'cancelado').length

  if (erros === 0 && cancelados === 0) {
    return ok === 1 ? 'Conversão concluída.' : `${ok} conversões concluídas.`
  }

  const partes = [`${ok} de ${desfechos.length} ${ok === 1 ? 'conversão' : 'conversões'} concluída${ok === 1 ? '' : 's'}.`]
  if (erros > 0) partes.push(`${erros} ${erros === 1 ? 'falhou' : 'falharam'}.`)
  if (cancelados > 0) partes.push(`${cancelados} ${cancelados === 1 ? 'foi cancelada' : 'foram canceladas'}.`)
  return partes.join(' ')
}

function erroDeDominio(erro: unknown): JobError {
  if (erro instanceof ErroDoMotor) return erro.detalhe

  const detail = erro instanceof Error ? erro.message.slice(0, 200) : null
  return {
    kind: 'falha-de-conversao',
    message: 'Não foi possível processar esta imagem.',
    // Com exactOptionalPropertyTypes, omitir a chave nao e o mesmo que a por
    // a undefined. Aqui queremos omitir.
    ...(detail === null ? {} : { detail }),
  }
}
