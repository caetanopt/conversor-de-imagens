/**
 * O resumo nao pode celebrar um recorte que destruiu a imagem.
 *
 * Defeito real, visto num screenshot da propria aplicacao: um objeto quase da
 * cor do fundo desaparecia por completo, o ficheiro caia para 173 bytes, e o
 * destaque lia "menos 94 %" em verde, imediatamente acima de um aviso a dizer
 * que a imagem tinha sido apagada. O numero era verdadeiro; o tom nao.
 *
 * E o espelho da seccao 24 do CLAUDE.md: se um aumento nunca pode ser
 * escondido, uma reducao que nao serve para nada tambem nao pode ser
 * apresentada como um ganho.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ConversionSummary } from '@/features/converter/components/ConversionSummary'
import { criarJob } from '@/features/converter/state/jobsReducer'
import type { ImageInspection, ImageJob } from '@/features/converter/types'

afterEach(() => {
  cleanup()
})

const INSPECAO: ImageInspection = {
  formatId: 'png',
  magickFormat: 'PNG',
  width: 900,
  height: 600,
  frameCount: 1,
  hasAlpha: false,
}

function jobComResultado(tamanhoFinal: number, backgroundKeptPercent: number | null): ImageJob {
  const base = criarJob(new File([new Uint8Array(2826)], 'produto.png', { type: 'image/png' }), 'png', 'png')
  return {
    ...base,
    inspection: INSPECAO,
    status: 'done',
    result: {
      blob: new Blob([new Uint8Array(tamanhoFinal)], { type: 'image/png' }),
      size: tamanhoFinal,
      width: 900,
      height: 600,
      formatId: 'png',
      durationMs: 464,
      decodeMs: 100,
      encodeMs: 364,
      profilesKept: [],
      frameCount: 1,
      outputFrameCount: 1,
      backgroundKeptPercent,
    },
  }
}

/** O bloco do destaque, identificado pela etiqueta que o encabeca. */
function destaque(): HTMLElement {
  const etiqueta = screen.getByText('Tamanho final')
  const bloco = etiqueta.parentElement
  if (!bloco) throw new Error('destaque sem bloco')
  return bloco
}

describe('ConversionSummary', () => {
  it('uma reducao normal continua a ser apresentada como um ganho', () => {
    render(<ConversionSummary job={jobComResultado(1200, null)} />)
    expect(destaque().className).toContain('reduziu')
    expect(destaque().className).not.toContain('suspeito')
  })

  it('um recorte bem-sucedido tambem, e diz quanto sobrou', () => {
    render(<ConversionSummary job={jobComResultado(3520, 21.3)} />)
    expect(screen.getByText(/Fundo removido/)).toBeTruthy()
    expect(screen.getByText(/Ficaram visíveis 21 % da imagem/)).toBeTruthy()
    expect(destaque().className).not.toContain('suspeito')
  })

  it('um recorte que apagou a imagem nao e um ganho, mesmo poupando 94 %', () => {
    render(<ConversionSummary job={jobComResultado(173, 0)} />)

    // O numero continua la, porque e verdade.
    expect(screen.getByText(/menos 94/)).toBeTruthy()
    // O tom e que muda: sem leitura de vitoria.
    expect(destaque().className).toContain('suspeito')
    expect(destaque().className).not.toContain('reduziu')
    // E diz o que aconteceu e o que fazer.
    expect(screen.getByText(/removeu a imagem quase toda/)).toBeTruthy()
    expect(screen.getByText(/Cor exata/)).toBeTruthy()
  })

  it('um recorte que nao removeu nada tambem fica marcado', () => {
    render(<ConversionSummary job={jobComResultado(2820, 100)} />)
    expect(destaque().className).toContain('suspeito')
    expect(screen.getByText(/Não foi removido fundo nenhum/)).toBeTruthy()
  })

  it('sem remocao pedida, nao aparece nada sobre fundo', () => {
    render(<ConversionSummary job={jobComResultado(1200, null)} />)
    expect(screen.queryByText(/fundo/i)).toBeNull()
  })
})
