import { describe, expect, it } from 'vitest'

import { AVIF_SPEED_POR_DEFEITO, resolveEncodeDirectives } from '@/lib/image-engine/options'
import { opcoesPorDefeito } from '@/features/converter/state/jobsReducer'
import type { ConversionOptions } from '@/features/converter/types'

function opcoes(parcial: Partial<ConversionOptions> = {}): ConversionOptions {
  return { ...opcoesPorDefeito('webp'), ...parcial }
}

describe('resolveEncodeDirectives', () => {
  it('usa o magickFormat do registry e nunca a extensao', () => {
    expect(resolveEncodeDirectives(opcoes({ outputFormat: 'jpeg' })).magickFormat).toBe('JPEG')
    expect(resolveEncodeDirectives(opcoes({ outputFormat: 'webp' })).magickFormat).toBe('WEBP')
  })

  it('nao envia qualidade para um formato sem perda', () => {
    const d = resolveEncodeDirectives(opcoes({ outputFormat: 'png', quality: 80 }))
    expect(d.quality).toBeNull()
  })

  it('envia qualidade para formatos com perda', () => {
    expect(resolveEncodeDirectives(opcoes({ outputFormat: 'jpeg', quality: 82 })).quality).toBe(82)
  })

  it('limita a qualidade ao intervalo valido', () => {
    expect(resolveEncodeDirectives(opcoes({ quality: 0 })).quality).toBe(1)
    expect(resolveEncodeDirectives(opcoes({ quality: 500 })).quality).toBe(100)
    expect(resolveEncodeDirectives(opcoes({ quality: 82.6 })).quality).toBe(83)
    expect(resolveEncodeDirectives(opcoes({ quality: Number.NaN })).quality).toBeNull()
  })

  it('aplica sempre heic:speed ao AVIF', () => {
    // Sem este define o AVIF mediu 19,2 s a 12 MP em vez de 2,1 s.
    const d = resolveEncodeDirectives(opcoes({ outputFormat: 'avif' }))
    expect(d.defines).toEqual([
      { format: 'HEIC', name: 'speed', value: AVIF_SPEED_POR_DEFEITO },
    ])
  })

  it('nao aplica heic:speed a formatos que nao sao AVIF', () => {
    expect(resolveEncodeDirectives(opcoes({ outputFormat: 'webp' })).defines).toEqual([])
  })

  it('aplica lossless de WebP so quando pedido', () => {
    expect(resolveEncodeDirectives(opcoes({ outputFormat: 'webp', lossless: true })).defines).toEqual(
      [{ format: 'WEBP', name: 'lossless', value: 'true' }],
    )
    expect(
      resolveEncodeDirectives(opcoes({ outputFormat: 'webp', lossless: false })).defines,
    ).toEqual([])
  })

  it('ativa progressivo apenas em JPEG', () => {
    expect(resolveEncodeDirectives(opcoes({ outputFormat: 'jpeg' })).interlace).toBe(true)
    expect(resolveEncodeDirectives(opcoes({ outputFormat: 'png' })).interlace).toBe(false)
    expect(resolveEncodeDirectives(opcoes({ outputFormat: 'webp' })).interlace).toBe(false)
  })

  it('mantem a ordem de auto orient antes do strip', () => {
    // A ordem e imposta no adapter, mas as duas flags tem de chegar la.
    const d = resolveEncodeDirectives(opcoes({ autoOrient: true, stripMetadata: true }))
    expect(d.autoOrient).toBe(true)
    expect(d.strip).toBe(true)
  })

  describe('resize', () => {
    it('e nulo quando nao ha resize pedido', () => {
      expect(resolveEncodeDirectives(opcoes({ resize: null })).resize).toBeNull()
    })

    it('e nulo quando nenhuma dimensao foi indicada', () => {
      const d = resolveEncodeDirectives(
        opcoes({
          resize: { width: null, height: null, preserveAspectRatio: true, allowUpscale: false },
        }),
      )
      expect(d.resize).toBeNull()
    })

    it('preserva proporcao e nao aumenta por defeito', () => {
      const d = resolveEncodeDirectives(
        opcoes({
          resize: { width: 800, height: null, preserveAspectRatio: true, allowUpscale: false },
        }),
      )
      expect(d.resize).toEqual({
        width: 800,
        height: 0,
        ignoreAspectRatio: false,
        onlyShrink: true,
      })
    })

    it('permite dimensoes exatas quando a proporcao e dispensada', () => {
      const d = resolveEncodeDirectives(
        opcoes({
          resize: { width: 400, height: 400, preserveAspectRatio: false, allowUpscale: true },
        }),
      )
      expect(d.resize).toEqual({
        width: 400,
        height: 400,
        ignoreAspectRatio: true,
        onlyShrink: false,
      })
    })
  })
})
