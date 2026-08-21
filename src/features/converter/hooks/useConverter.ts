'use client'

/**
 * Orquestracao do fluxo de conversao.
 *
 * Junta tres coisas e nada mais: o reducer da fila, o cliente do motor e o
 * ciclo de vida dos object URLs. Nao sabe nada sobre ImageMagick.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'

import { formatoPorId, type FormatId } from '@/config/formats'
import type { PresetId } from '@/config/presets'
import { EngineClient, ErroDoMotor } from '@/lib/image-engine/client/EngineClient'
import { registarConversao, registarFalha } from '@/lib/dev/metrics'
import { descarregarBlob } from '@/lib/download/saveBlob'
import { trocarExtensao } from '@/lib/download/fileNames'
import { revogarObjectUrl, revogarTodosOsObjectUrls } from '@/lib/files/objectUrls'
import { criarPreview } from '@/lib/files/preview'
import { lerCabecalho } from '@/lib/files/readFile'
import { validarFicheiro, validarInspecao } from '@/lib/validation/validateFile'
import {
  criarJob,
  destinoSugerido,
  estadoInicial,
  jobsReducer,
} from '../state/jobsReducer'
import type {
  ConversionMode,
  ImageJob,
  JobError,
  MetadataPolicy,
  ResizeOptions,
} from '../types'

/**
 * Estado do arranque do motor, exposto a interface de proposito.
 * Sao 5,1 MB comprimidos a descarregar, e o utilizador tem direito a saber
 * que e isso que esta a acontecer em vez de ver um spinner sem explicacao.
 */
export type EstadoDoMotor = 'inativo' | 'a-preparar' | 'pronto' | 'indisponivel'

export function useConverter() {
  const [estado, dispatch] = useReducer(jobsReducer, estadoInicial)
  const [estadoDoMotor, setEstadoDoMotor] = useState<EstadoDoMotor>('inativo')
  const [anuncio, setAnuncio] = useState('')

  const clienteRef = useRef<EngineClient | null>(null)
  const montadoRef = useRef(true)

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

  /**
   * Nesta etapa a area de trabalho trata uma imagem de cada vez, por isso um
   * ficheiro novo substitui o anterior. O estado ja e uma lista, portanto o
   * lote nao obriga a mudar nada disto.
   */
  const adicionarFicheiro = useCallback(
    async (file: File): Promise<void> => {
      for (const job of estado.jobs) revogarObjectUrl(job.preview?.url)
      dispatch({ type: 'limpar' })

      const cabecalho = await lerCabecalho(file)
      const validacao = validarFicheiro(file, cabecalho)

      if (!validacao.ok) {
        const job = criarJob(file, null, 'webp')
        dispatch({ type: 'adicionar', job })
        dispatch({ type: 'erro', id: job.id, error: validacao.error })
        setAnuncio(`Ficheiro rejeitado. ${validacao.error.message}`)
        return
      }

      const job = criarJob(file, validacao.formatId, destinoSugerido(validacao.formatId))
      dispatch({ type: 'adicionar', job })
      if (validacao.warnings.length > 0) {
        dispatch({ type: 'avisos', id: job.id, warnings: validacao.warnings })
      }
      setAnuncio(`Imagem carregada. Formato ${formatoPorId(validacao.formatId).label}.`)

      if (!(await prepararMotor())) {
        if (montadoRef.current) {
          dispatch({
            type: 'erro',
            id: job.id,
            error: {
              kind: 'motor-indisponivel',
              message:
                'Não foi possível preparar o motor de conversão. Verifique a ligação e recarregue a página.',
            },
          })
        }
        return
      }

      try {
        const inspecao = await cliente().inspect(file)
        if (!montadoRef.current) return

        const validacaoDimensoes = validarInspecao(inspecao)
        if (!validacaoDimensoes.ok) {
          dispatch({ type: 'erro', id: job.id, error: validacaoDimensoes.error })
          setAnuncio(validacaoDimensoes.error.message)
          return
        }

        dispatch({ type: 'inspecao', id: job.id, inspection: inspecao })
        if (validacaoDimensoes.warnings.length > 0) {
          dispatch({ type: 'avisos', id: job.id, warnings: validacaoDimensoes.warnings })
        }

        const preview = await criarPreview(file, validacao.formatId, inspecao)
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
    [cliente, estado.jobs, prepararMotor],
  )

  const converter = useCallback(
    async (id: string): Promise<void> => {
      const job = estado.jobs.find((j) => j.id === id)
      if (!job) return

      dispatch({ type: 'estado', id, status: 'processing' })
      setAnuncio('A converter.')

      try {
        const resultado = await cliente().convert(job.file, job.options)
        if (!montadoRef.current) return

        dispatch({
          type: 'resultado',
          id,
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
        setAnuncio('Conversão concluída.')
      } catch (erro) {
        if (!montadoRef.current) return
        const dominio = erroDeDominio(erro)
        dispatch({ type: 'erro', id, error: dominio })
        registarFalha(job.options.outputFormat, dominio.kind, dominio.detail)
        setAnuncio(`Conversão falhou. ${dominio.message}`)
      }
    },
    [cliente, estado.jobs],
  )

  const cancelar = useCallback(() => {
    clienteRef.current?.cancel()
    for (const job of estado.jobs) {
      if (job.status === 'processing') dispatch({ type: 'estado', id: job.id, status: 'cancelled' })
    }
    setAnuncio('Conversão cancelada.')
  }, [estado.jobs])

  const remover = useCallback(
    (id: string) => {
      const job = estado.jobs.find((j) => j.id === id)
      revogarObjectUrl(job?.preview?.url)
      dispatch({ type: 'remover', id })
      setAnuncio('Imagem removida.')
    },
    [estado.jobs],
  )

  const descarregar = useCallback((job: ImageJob) => {
    if (!job.result) return
    descarregarBlob(job.result.blob, trocarExtensao(job.sourceName, job.result.formatId))
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

  const definirMetadados = useCallback((id: string, metadata: MetadataPolicy) => {
    dispatch({ type: 'metadados', id, metadata })
  }, [])

  const definirResize = useCallback((id: string, resize: ResizeOptions | null) => {
    dispatch({ type: 'resize', id, resize })
  }, [])

  const definirModo = useCallback((mode: ConversionMode) => {
    dispatch({ type: 'modo', mode })
  }, [])

  const jobAtivo = useMemo(() => estado.jobs.at(-1) ?? null, [estado.jobs])

  return {
    jobs: estado.jobs,
    jobAtivo,
    mode: estado.mode,
    estadoDoMotor,
    anuncio,
    adicionarFicheiro,
    converter,
    cancelar,
    remover,
    descarregar,
    definirFormatoDeSaida,
    definirQualidade,
    definirPreset,
    definirMetadados,
    definirResize,
    definirModo,
  }
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
