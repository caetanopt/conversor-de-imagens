/**
 * Interruptor de tema: comportamento de switch binario.
 *
 * As funcoes puras de src/lib/tema/tema.ts tem teste proprio em tema.test.ts.
 * Este ficheiro cobre o que so existe no componente: resolver 'sistema' para
 * o que o SO prefere no momento, reagir a uma mudanca do SO enquanto nao
 * existe escolha explicita, e parar de reagir assim que existe.
 *
 * `jsdom` nao implementa `matchMedia`. O metodo falso abaixo devolve sempre o
 * mesmo objeto controlavel, com `disparar` a simular o SO a mudar de tema.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ATRIBUTO_DO_TEMA, CHAVE_DO_TEMA } from '@/lib/tema/tema'
import { ThemeToggle } from '@/components/controls/ThemeToggle'

type ConsultaFalsa = MediaQueryList & { disparar: (escuro: boolean) => void }

function criarConsultaFalsa(inicial: boolean): ConsultaFalsa {
  const ouvintes = new Set<(evento: MediaQueryListEvent) => void>()
  const consulta = {
    media: '(prefers-color-scheme: dark)',
    matches: inicial,
    onchange: null,
    addEventListener: (tipo: string, ouvinte: (evento: MediaQueryListEvent) => void) => {
      if (tipo === 'change') ouvintes.add(ouvinte)
    },
    removeEventListener: (tipo: string, ouvinte: (evento: MediaQueryListEvent) => void) => {
      if (tipo === 'change') ouvintes.delete(ouvinte)
    },
    dispatchEvent: () => true,
    addListener: () => {},
    removeListener: () => {},
    disparar(escuro: boolean) {
      consulta.matches = escuro
      const evento = { matches: escuro } as MediaQueryListEvent
      for (const ouvinte of ouvintes) ouvinte(evento)
    },
  }
  return consulta as ConsultaFalsa
}

let consultaAtual: ConsultaFalsa

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute(ATRIBUTO_DO_TEMA)
  consultaAtual = criarConsultaFalsa(false)
  vi.stubGlobal('matchMedia', vi.fn(() => consultaAtual))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ThemeToggle', () => {
  it('e um switch acessivel', async () => {
    render(<ThemeToggle />)
    // `findByRole` ja lanca se nao existir; a asserçao confirma o elemento
    // certo, um botao, e nao outra coisa com role="switch" por engano.
    const interruptor = await screen.findByRole('switch')
    expect(interruptor.tagName).toBe('BUTTON')
  })

  it('sem escolha guardada, comeca no lado que o sistema prefere agora', async () => {
    consultaAtual = criarConsultaFalsa(true) // sistema prefere escuro
    vi.stubGlobal('matchMedia', vi.fn(() => consultaAtual))

    render(<ThemeToggle />)
    const interruptor = await screen.findByRole('switch')
    expect(interruptor.getAttribute('aria-checked')).toBe('true')
    expect(interruptor.getAttribute('aria-label')).toMatch(/tema escuro/i)
  })

  it('sem escolha guardada e sistema em claro, comeca desligado', async () => {
    render(<ThemeToggle />) // consultaAtual por defeito comeca com matches: false
    const interruptor = await screen.findByRole('switch')
    expect(interruptor.getAttribute('aria-checked')).toBe('false')
    expect(interruptor.getAttribute('aria-label')).toMatch(/tema claro/i)
  })

  it('um clique liga o switch, guarda a escolha e aplica o atributo ao documento', async () => {
    render(<ThemeToggle />)
    const interruptor = await screen.findByRole('switch')
    expect(interruptor.getAttribute('aria-checked')).toBe('false')

    fireEvent.click(interruptor)

    expect(interruptor.getAttribute('aria-checked')).toBe('true')
    expect(localStorage.getItem(CHAVE_DO_TEMA)).toBe('escuro')
    expect(document.documentElement.getAttribute(ATRIBUTO_DO_TEMA)).toBe('escuro')
  })

  it('um segundo clique desliga outra vez', async () => {
    render(<ThemeToggle />)
    const interruptor = await screen.findByRole('switch')

    fireEvent.click(interruptor)
    fireEvent.click(interruptor)

    expect(interruptor.getAttribute('aria-checked')).toBe('false')
    expect(localStorage.getItem(CHAVE_DO_TEMA)).toBe('claro')
  })

  it('antes de qualquer clique, uma mudanca do sistema atualiza o switch', async () => {
    render(<ThemeToggle />)
    const interruptor = await screen.findByRole('switch')
    expect(interruptor.getAttribute('aria-checked')).toBe('false')

    // O listener corre fora do sistema de eventos do React, portanto a
    // atualizacao de estado que ele despoleta precisa de `act` para ser
    // aplicada ao DOM antes da asserçao seguinte correr.
    act(() => {
      consultaAtual.disparar(true)
    })

    expect(interruptor.getAttribute('aria-checked')).toBe('true')
  })

  it('depois de uma escolha explicita, deixa de seguir o sistema', async () => {
    render(<ThemeToggle />)
    const interruptor = await screen.findByRole('switch')

    fireEvent.click(interruptor) // escolha explicita: escuro
    expect(interruptor.getAttribute('aria-checked')).toBe('true')

    // O sistema muda para claro, mas a escolha do utilizador prevalece.
    act(() => {
      consultaAtual.disparar(false)
    })
    expect(interruptor.getAttribute('aria-checked')).toBe('true')
  })

  it('remove o ouvinte de matchMedia ao desmontar', async () => {
    const remover = vi.spyOn(consultaAtual, 'removeEventListener')
    const { unmount } = render(<ThemeToggle />)
    await screen.findByRole('switch')

    unmount()

    expect(remover).toHaveBeenCalledWith('change', expect.any(Function))
  })
})
