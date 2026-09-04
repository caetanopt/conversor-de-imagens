/**
 * BatchActionBar: o texto do botao principal segue o modo em vigor.
 *
 * O botao ficou preso em "Converter..." quando "Otimizar" passou a ser o
 * modo por defeito, porque o texto do botao nunca lia o modo atual.
 * CLAUDE.md, seccao 12.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BatchActionBar } from '@/features/converter/components/BatchActionBar'
import { criarJob, type ConverterState } from '@/features/converter/state/jobsReducer'
import { resumirLote } from '@/features/converter/state/selectors'

afterEach(() => {
  cleanup()
})

function ficheiro(nome = 'foto.jpg'): File {
  return new File([new Uint8Array(1000)], nome, { type: 'image/jpeg' })
}

const SEM_ACAO = {
  motorPronto: true,
  aAnalisar: false,
  aEmpacotar: false,
  onConverter: vi.fn(),
  onConverterTodos: vi.fn(),
  onDescarregar: vi.fn(),
  onDescarregarTodos: vi.fn(),
  onCancelar: vi.fn(),
}

describe('BatchActionBar', () => {
  it('o verbo do botao segue o terceiro modo tambem', () => {
    const job = criarJob(ficheiro(), 'jpeg', 'jpeg')
    const estado: ConverterState = { jobs: [job], mode: 'redimensionar', selecionadoId: null }
    render(
      <BatchActionBar
        resumo={resumirLote(estado)}
        selecionado={job}
        mode="redimensionar"
        {...SEM_ACAO}
      />,
    )
    expect(screen.getByRole('button', { name: /^Redimensionar para/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Otimizar/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Converter/ })).toBeNull()
  })

  it('com um ficheiro, o verbo do botao muda entre otimizar e converter', () => {
    const job = criarJob(ficheiro(), 'jpeg', 'jpeg')
    const estado: ConverterState = { jobs: [job], mode: 'otimizar', selecionadoId: null }
    const resumo = resumirLote(estado)

    const { rerender } = render(
      <BatchActionBar resumo={resumo} selecionado={job} mode="otimizar" {...SEM_ACAO} />,
    )
    expect(screen.getByRole('button', { name: /^Otimizar para/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Converter/ })).toBeNull()

    rerender(<BatchActionBar resumo={resumo} selecionado={job} mode="converter" {...SEM_ACAO} />)
    expect(screen.getByRole('button', { name: /^Converter para/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Otimizar/ })).toBeNull()
  })

  it('em lote, o numero de ficheiros por processar acompanha o verbo do modo', () => {
    const primeiro = criarJob(ficheiro('a.jpg'), 'jpeg', 'jpeg')
    const segundo = criarJob(ficheiro('b.png'), 'png', 'png')
    const estado: ConverterState = { jobs: [primeiro, segundo], mode: 'otimizar', selecionadoId: null }
    const resumo = resumirLote(estado)

    const { rerender } = render(
      <BatchActionBar resumo={resumo} selecionado={primeiro} mode="otimizar" {...SEM_ACAO} />,
    )
    expect(screen.getByRole('button', { name: 'Otimizar 2 imagens' })).toBeTruthy()

    rerender(<BatchActionBar resumo={resumo} selecionado={primeiro} mode="converter" {...SEM_ACAO} />)
    expect(screen.getByRole('button', { name: 'Converter 2 imagens' })).toBeTruthy()
  })
})
