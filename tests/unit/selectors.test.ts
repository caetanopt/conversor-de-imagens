/**
 * Leituras derivadas do estado da fila.
 *
 * O estado do lote e a parte facil de errar: dizer "concluido" com falhas pelo
 * meio e exatamente o que o CLAUDE.md, seccao 17.7, proibe. Aqui verifica-se
 * cada combinacao.
 */
import { describe, expect, it } from 'vitest'

import { criarJob, estadoInicial, jobsReducer } from '@/features/converter/state/jobsReducer'
import {
  convertiveis,
  ehLote,
  jobSelecionado,
  resumirLote,
} from '@/features/converter/state/selectors'
import type { ConverterState } from '@/features/converter/state/jobsReducer'
import type { ConversionResult, ImageJob, JobError } from '@/features/converter/types'

function ficheiro(nome: string, tamanho: number): File {
  return new File([new Uint8Array(tamanho)], nome, { type: 'image/jpeg' })
}

function resultado(size: number): ConversionResult {
  return {
    blob: new Blob([new Uint8Array(size)]),
    size,
    width: 100,
    height: 100,
    formatId: 'webp',
    durationMs: 10,
    decodeMs: 4,
    encodeMs: 6,
    profilesKept: [],
    frameCount: 1,
    outputFrameCount: 1,
  backgroundKeptPercent: null,
}
}

/** Fila montada pelo reducer, para o teste nao inventar um estado impossivel. */
function fila(...especificacoes: readonly {
  nome: string
  tamanho?: number
  status?: ImageJob['status']
  result?: ConversionResult
  error?: JobError
  semFormato?: boolean
}[]): ConverterState {
  const jobs = especificacoes.map((e) =>
    criarJob(ficheiro(e.nome, e.tamanho ?? 1000), e.semFormato ? null : 'jpeg', 'webp'),
  )
  let estado = jobsReducer(estadoInicial, { type: 'adicionar', jobs })

  for (const [indice, e] of especificacoes.entries()) {
    const id = jobs[indice]!.id
    if (e.result) estado = jobsReducer(estado, { type: 'resultado', id, result: e.result })
    if (e.error) estado = jobsReducer(estado, { type: 'erro', id, error: e.error })
    if (e.status) estado = jobsReducer(estado, { type: 'estado', id, status: e.status })
  }

  return estado
}

const ERRO_MOTOR: JobError = { kind: 'falha-de-conversao', message: 'falhou' }
const ERRO_FICHEIRO: JobError = { kind: 'ficheiro-invalido', message: 'danificado' }

describe('resumirLote: estado', () => {
  it('vazio sem ficheiros', () => {
    expect(resumirLote(estadoInicial).estado).toBe('vazio')
  })

  it('pronto quando ainda ha trabalho por fazer', () => {
    expect(resumirLote(fila({ nome: 'a.jpg' }, { nome: 'b.jpg' })).estado).toBe('pronto')
  })

  it('pronto quando parte concluiu e o resto ainda espera', () => {
    const estado = fila({ nome: 'a.jpg', result: resultado(500) }, { nome: 'b.jpg' })
    expect(resumirLote(estado).estado).toBe('pronto')
  })

  it('a processar assim que um ficheiro arranca', () => {
    const estado = fila({ nome: 'a.jpg', status: 'processing' }, { nome: 'b.jpg' })
    expect(resumirLote(estado).estado).toBe('a-processar')
  })

  it('concluido apenas quando todos concluiram', () => {
    const estado = fila(
      { nome: 'a.jpg', result: resultado(500) },
      { nome: 'b.jpg', result: resultado(600) },
    )
    expect(resumirLote(estado).estado).toBe('concluido')
  })

  it('parcial quando parte falhou', () => {
    const estado = fila({ nome: 'a.jpg', result: resultado(500) }, { nome: 'b.jpg', error: ERRO_MOTOR })
    const resumo = resumirLote(estado)
    expect(resumo.estado).toBe('parcial')
    expect(resumo.concluidos).toBe(1)
    expect(resumo.comErro).toBe(1)
  })

  it('parcial quando parte foi cancelada', () => {
    const estado = fila(
      { nome: 'a.jpg', result: resultado(500) },
      { nome: 'b.jpg', status: 'cancelled' },
    )
    expect(resumirLote(estado).estado).toBe('parcial')
  })

  it('falhou quando nenhum concluiu', () => {
    const estado = fila({ nome: 'a.jpg', error: ERRO_MOTOR }, { nome: 'b.jpg', error: ERRO_MOTOR })
    expect(resumirLote(estado).estado).toBe('falhou')
  })
})

describe('resumirLote: numeros', () => {
  it('soma apenas os ficheiros que ja concluiram', () => {
    const estado = fila(
      { nome: 'a.jpg', tamanho: 1000, result: resultado(400) },
      // Este ainda nao correu: contar o original dele tornaria a reducao
      // aparente menor do que e.
      { nome: 'b.jpg', tamanho: 5000 },
    )
    const resumo = resumirLote(estado)
    expect(resumo.bytesOriginais).toBe(1000)
    expect(resumo.bytesFinais).toBe(400)
  })

  it('conta zero bytes quando nada concluiu', () => {
    const resumo = resumirLote(fila({ nome: 'a.jpg' }))
    expect(resumo.bytesOriginais).toBe(0)
    expect(resumo.bytesFinais).toBe(0)
    expect(resumo.concluidosComResultado).toHaveLength(0)
  })

  it('mantem a ordem da fila nos resultados, que e a ordem do ZIP', () => {
    const estado = fila(
      { nome: 'primeiro.jpg', result: resultado(100) },
      { nome: 'segundo.jpg', result: resultado(200) },
    )
    expect(resumirLote(estado).concluidosComResultado.map((j) => j.sourceName)).toEqual([
      'primeiro.jpg',
      'segundo.jpg',
    ])
  })
})

describe('convertiveis e porConverter', () => {
  it('nao divergem: o numero do botao e o que a acao processa', () => {
    const estado = fila(
      { nome: 'a.jpg' },
      { nome: 'b.jpg', status: 'cancelled' },
      { nome: 'c.jpg', error: ERRO_MOTOR },
      { nome: 'd.jpg', semFormato: true, error: ERRO_FICHEIRO },
      { nome: 'e.jpg', result: resultado(100) },
    )
    expect(resumirLote(estado).porConverter).toBe(convertiveis(estado).length)
  })

  it('inclui cancelados, porque cancelar nao e recusar', () => {
    const estado = fila({ nome: 'a.jpg', status: 'cancelled' })
    expect(convertiveis(estado)).toHaveLength(1)
  })

  it('inclui erros do motor, que podem mudar com outras definicoes', () => {
    const estado = fila({ nome: 'a.jpg', error: ERRO_MOTOR })
    expect(convertiveis(estado)).toHaveLength(1)
  })

  it('exclui ficheiros recusados pela validacao', () => {
    // Tentar de novo com outro formato de destino nao torna um ficheiro
    // danificado legivel.
    const estado = fila({ nome: 'a.jpg', semFormato: true, error: ERRO_FICHEIRO })
    expect(convertiveis(estado)).toHaveLength(0)
  })

  it('exclui o que ja concluiu', () => {
    const estado = fila({ nome: 'a.jpg', result: resultado(100) })
    expect(convertiveis(estado)).toHaveLength(0)
  })

  it('exclui o que esta a processar, para nao entrar duas vezes na fila', () => {
    const estado = fila({ nome: 'a.jpg', status: 'processing' })
    expect(convertiveis(estado)).toHaveLength(0)
  })
})

describe('jobSelecionado', () => {
  it('devolve null com a fila vazia', () => {
    expect(jobSelecionado(estadoInicial)).toBeNull()
  })

  it('devolve o selecionado', () => {
    const estado = fila({ nome: 'a.jpg' }, { nome: 'b.jpg' })
    const segundo = estado.jobs[1]!
    const comSelecao = jobsReducer(estado, { type: 'selecionar', id: segundo.id })
    expect(jobSelecionado(comSelecao)?.id).toBe(segundo.id)
  })

  it('cai no primeiro quando o id selecionado ja nao existe', () => {
    const estado = fila({ nome: 'a.jpg' }, { nome: 'b.jpg' })
    const invalido: ConverterState = { ...estado, selecionadoId: 'id-que-nao-existe' }
    expect(jobSelecionado(invalido)?.sourceName).toBe('a.jpg')
  })
})

describe('ehLote', () => {
  it('e falso com zero ou um ficheiro', () => {
    expect(ehLote(estadoInicial)).toBe(false)
    expect(ehLote(fila({ nome: 'a.jpg' }))).toBe(false)
  })

  it('e verdadeiro a partir de dois', () => {
    expect(ehLote(fila({ nome: 'a.jpg' }, { nome: 'b.jpg' }))).toBe(true)
  })
})
