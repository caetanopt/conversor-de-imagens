/**
 * Traducao da percentagem medida nos tres desfechos possiveis.
 *
 * Existe porque a remocao por limiar falha de duas maneiras opostas e a
 * interface tem de as distinguir: dizer "concluido" a um ficheiro em branco e
 * tao mau como dizer "falhou" a um recorte correto.
 */
import { describe, expect, it } from 'vitest'

import { avaliarFundo } from '@/features/converter/state/fundo'

describe('avaliarFundo', () => {
  it('sem remocao pedida nao ha nada a dizer', () => {
    expect(avaliarFundo(null)).toBeNull()
  })

  it('um recorte normal e um sucesso, com o numero visivel', () => {
    const d = avaliarFundo(21.3)
    expect(d?.tipo).toBe('removido')
    expect(d?.restantePercent).toBe(21)
    expect(d?.mensagem).toContain('21 %')
    // Um sucesso nao leva sugestao: nao ha nada a corrigir.
    expect(d?.sugestao).toBeUndefined()
  })

  it('imagem inteiramente transparente e o caso destrutivo, nao um sucesso', () => {
    // Medido: um objeto quase branco sobre branco a 8 % de tolerancia da
    // exactamente isto. O utilizador receberia um ficheiro vazio.
    const d = avaliarFundo(0)
    expect(d?.tipo).toBe('apagou-a-imagem')
    expect(d?.sugestao).toContain('Cor exata')
  })

  it('uma nesga de imagem a sobreviver tambem conta como destruida', () => {
    // O limiar nao esta exactamente em zero de proposito: uma imagem com 1 %
    // de pixeis vivos e igualmente inutil, e um limiar em zero deixava-a
    // passar como recorte valido.
    expect(avaliarFundo(1.4)?.tipo).toBe('apagou-a-imagem')
  })

  it('nada removido nao e um sucesso silencioso', () => {
    // Medido: fundo fotografico a 2 % de tolerancia devolve 100 %.
    const d = avaliarFundo(100)
    expect(d?.tipo).toBe('nao-encontrou-fundo')
    expect(d?.sugestao).toContain('variação de cor maior')
  })

  it('a fronteira esfumada de um recorte legitimo nao conta como falha', () => {
    // A percentagem vem da media do canal alfa, portanto um recorte com pouco
    // fundo nunca da exactamente 100. 98 % ainda e um recorte, nao uma falha.
    expect(avaliarFundo(98)?.tipo).toBe('removido')
  })

  it('os limiares sao exclusivos nas duas pontas', () => {
    expect(avaliarFundo(2)?.tipo).toBe('removido')
    expect(avaliarFundo(1.99)?.tipo).toBe('apagou-a-imagem')
    expect(avaliarFundo(99)?.tipo).toBe('removido')
    expect(avaliarFundo(99.01)?.tipo).toBe('nao-encontrou-fundo')
  })

  it('as mensagens estao em Portugues de Portugal', () => {
    const textos = [avaliarFundo(0), avaliarFundo(50), avaliarFundo(100)]
      .flatMap((d) => [d?.mensagem ?? '', d?.sugestao ?? ''])
      .join(' ')
    // Variantes brasileiras que o CLAUDE.md, seccao 15, proibe.
    for (const proibido of ['arquivo', 'baixar', 'configurações', 'tela']) {
      expect(textos.toLowerCase()).not.toContain(proibido)
    }
  })
})
