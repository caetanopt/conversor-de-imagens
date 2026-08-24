/**
 * O que a interface promete sobre fotogramas.
 *
 * A regra do CLAUDE.md, seccao 5.8, tem duas partes, e as duas sao testadas:
 * nunca eliminar animacao em silencio, e informar ANTES da conversao. A
 * segunda parte e a razao de esta ser uma funcao do par (origem, destino) e
 * nao um aviso guardado no momento em que o ficheiro entra.
 */
import { describe, expect, it } from 'vitest'

import { avaliarLimiteDeDimensao } from '@/features/converter/state/dimensoes'
import { avaliarFrames, etiquetasDasAlternativas } from '@/features/converter/state/frames'
import type { ImageInspection } from '@/features/converter/types'

function inspecao(parcial: Partial<ImageInspection> = {}): ImageInspection {
  return {
    formatId: 'gif',
    magickFormat: 'GIF',
    width: 240,
    height: 160,
    frameCount: 6,
    hasAlpha: false,
    ...parcial,
  }
}

describe('avaliarFrames', () => {
  it('nao diz nada sobre um ficheiro de um fotograma', () => {
    expect(avaliarFrames(inspecao({ frameCount: 1 }), 'png')).toBeNull()
  })

  it('nao diz nada sem inspecao feita', () => {
    expect(avaliarFrames(null, 'png')).toBeNull()
  })

  it('nao diz nada quando o formato de origem e desconhecido', () => {
    expect(avaliarFrames(inspecao({ formatId: null }), 'png')).toBeNull()
  })
})

describe('animacao', () => {
  it('avisa que um GIF animado perde a animacao em PNG', () => {
    const noticia = avaliarFrames(inspecao(), 'png')
    expect(noticia?.tipo).toBe('reduzidos')
    expect(noticia?.frames).toBe(6)
    expect(noticia?.mensagem).toContain('animada')
    expect(noticia?.mensagem).toContain('6 fotogramas')
    expect(noticia?.mensagem).toContain('primeiro fotograma')
  })

  it('sugere os formatos que preservariam a animacao', () => {
    const noticia = avaliarFrames(inspecao(), 'png')
    expect(noticia?.alternativas).toContain('gif')
    expect(noticia?.alternativas).toContain('webp')
    // JPEG e AVIF nao guardam animacao nesta versao, portanto nao sao sugestoes.
    expect(noticia?.alternativas).not.toContain('jpeg')
    expect(noticia?.alternativas).not.toContain('avif')
    expect(etiquetasDasAlternativas(noticia!)).toMatch(/WebP|GIF/)
  })

  it('confirma que WebP preserva a animacao', () => {
    const noticia = avaliarFrames(inspecao(), 'webp')
    expect(noticia?.tipo).toBe('preservados')
    expect(noticia?.mensagem).toContain('preserva a animação')
    // Nada a sugerir: o destino escolhido ja serve.
    expect(noticia?.alternativas).toHaveLength(0)
  })

  it('confirma que GIF para GIF preserva a animacao', () => {
    expect(avaliarFrames(inspecao(), 'gif')?.tipo).toBe('preservados')
  })

  it('nao oferece o formato ja escolhido como alternativa', () => {
    const noticia = avaliarFrames(inspecao(), 'jpeg')
    expect(noticia?.alternativas).not.toContain('jpeg')
  })
})

describe('tamanhos e paginas', () => {
  it('um ICO de varios tamanhos avisa que fica o maior', () => {
    const noticia = avaliarFrames(
      inspecao({ formatId: 'ico', magickFormat: 'ICO', frameCount: 3 }),
      'png',
    )
    expect(noticia?.tipo).toBe('reduzidos')
    expect(noticia?.mensagem).toContain('3 tamanhos')
    expect(noticia?.mensagem).toContain('maior')
    // Falar de animacao aqui seria errado: nao ha animacao num ICO.
    expect(noticia?.mensagem).not.toContain('animada')
  })

  it('um TIFF de varias paginas avisa que fica a primeira', () => {
    const noticia = avaliarFrames(
      inspecao({ formatId: 'tiff', magickFormat: 'TIFF', frameCount: 4 }),
      'jpeg',
    )
    expect(noticia?.mensagem).toContain('4 páginas')
    expect(noticia?.mensagem).toContain('primeira')
  })

  it('nao propoe um GIF para guardar os tamanhos de um ICO', () => {
    // Sao coisas diferentes: uma sequencia no tempo nao guarda um conjunto de
    // dimensoes. Como ICO e TIFF ainda nao estao ativos, nao ha alternativa.
    const noticia = avaliarFrames(
      inspecao({ formatId: 'ico', magickFormat: 'ICO', frameCount: 3 }),
      'png',
    )
    expect(noticia?.alternativas).not.toContain('gif')
    expect(noticia?.alternativas).not.toContain('webp')
  })
})

describe('limite de dimensao do destino', () => {
  it('avisa que um ICO vai reduzir uma imagem grande', () => {
    const limite = avaliarLimiteDeDimensao(
      { formatId: 'jpeg', magickFormat: 'JPEG', width: 1200, height: 800, frameCount: 1, hasAlpha: false },
      'ico',
      null,
    )
    expect(limite?.limite).toBe(256)
    expect(limite?.width).toBe(256)
    expect(limite?.height).toBe(171)
  })

  it('nao avisa quando a imagem ja cabe no limite', () => {
    const limite = avaliarLimiteDeDimensao(
      { formatId: 'png', magickFormat: 'PNG', width: 64, height: 64, frameCount: 1, hasAlpha: true },
      'ico',
      null,
    )
    expect(limite).toBeNull()
  })

  it('nao avisa quando o utilizador ja pediu dimensoes dentro do limite', () => {
    // Redimensionar para 128 px torna o limite do ICO irrelevante, e um aviso
    // sobre algo que nao vai acontecer e ruido.
    const limite = avaliarLimiteDeDimensao(
      { formatId: 'jpeg', magickFormat: 'JPEG', width: 1200, height: 800, frameCount: 1, hasAlpha: false },
      'ico',
      { width: 128, height: null, preserveAspectRatio: true, allowUpscale: false },
    )
    expect(limite).toBeNull()
  })

  it('avisa quando o utilizador pede dimensoes acima do limite', () => {
    const limite = avaliarLimiteDeDimensao(
      { formatId: 'jpeg', magickFormat: 'JPEG', width: 1200, height: 800, frameCount: 1, hasAlpha: false },
      'ico',
      { width: 600, height: null, preserveAspectRatio: true, allowUpscale: false },
    )
    expect(limite?.width).toBe(256)
  })

  it('os formatos sem limite nao dizem nada', () => {
    for (const destino of ['jpeg', 'png', 'webp', 'avif', 'gif', 'bmp', 'tiff'] as const) {
      const limite = avaliarLimiteDeDimensao(
        { formatId: 'jpeg', magickFormat: 'JPEG', width: 6000, height: 4000, frameCount: 1, hasAlpha: false },
        destino,
        null,
      )
      expect(limite, destino).toBeNull()
    }
  })
})
