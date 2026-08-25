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
    // O teto e por formato desde que o AVIF se mostrou incapaz de gravar a 100,
    // por isso cada caso nomeia o formato.
    expect(resolveEncodeDirectives(opcoes({ outputFormat: 'jpeg', quality: 0 })).quality).toBe(1)
    expect(resolveEncodeDirectives(opcoes({ outputFormat: 'jpeg', quality: -5 })).quality).toBe(1)
    expect(resolveEncodeDirectives(opcoes({ outputFormat: 'jpeg', quality: 500 })).quality).toBe(100)
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

  /*
   * O define `webp:lossless` foi removido depois de medido. Prometia sem perda
   * e nao cumpria abaixo da qualidade 100:
   *
   *   q100                    1 065 458 bytes   SSIM 0
   *   define lossless + q100  1 065 458 bytes   SSIM 0        (bytes iguais)
   *   define lossless + q80     745 502 bytes   SSIM 0,0024   (nao e sem perda)
   *
   * Sem perda passou a resolver-se para qualidade 100, o caminho que funciona.
   */
  it('sem perda em WebP resolve-se para qualidade 100 e nao para um define', () => {
    const d = resolveEncodeDirectives(opcoes({ outputFormat: 'webp', lossless: true }))
    expect(d.quality).toBe(100)
    expect(d.defines).toEqual([])
  })

  it('sem perda desligado deixa a qualidade escolhida intacta', () => {
    const d = resolveEncodeDirectives(
      opcoes({ outputFormat: 'webp', lossless: false, quality: 80 }),
    )
    expect(d.quality).toBe(80)
  })

  it('sem perda e ignorado num formato onde nao e uma escolha', () => {
    // Num PNG nao ha nada a escolher, e num AVIF a qualidade 100 lanca erro do
    // encoder. Nos dois casos a opcao nao pode alterar a qualidade.
    expect(resolveEncodeDirectives(opcoes({ outputFormat: 'png', lossless: true })).quality).toBeNull()
    expect(
      resolveEncodeDirectives(opcoes({ outputFormat: 'avif', lossless: true, quality: 65 })).quality,
    ).toBe(65)
  })

  it('trava a qualidade no teto do formato, e nao em 100', () => {
    // Defesa em profundidade: um valor guardado antes de o formato mudar
    // chegaria intacto ao motor, e em AVIF q100 lanca erro.
    expect(
      resolveEncodeDirectives(opcoes({ outputFormat: 'avif', quality: 100 })).quality,
    ).toBe(99)
    expect(
      resolveEncodeDirectives(opcoes({ outputFormat: 'webp', quality: 100 })).quality,
    ).toBe(99)
    expect(
      resolveEncodeDirectives(opcoes({ outputFormat: 'jpeg', quality: 100 })).quality,
    ).toBe(100)
  })


  it('ativa progressivo apenas em JPEG', () => {
    expect(resolveEncodeDirectives(opcoes({ outputFormat: 'jpeg' })).interlace).toBe(true)
    expect(resolveEncodeDirectives(opcoes({ outputFormat: 'png' })).interlace).toBe(false)
    expect(resolveEncodeDirectives(opcoes({ outputFormat: 'webp' })).interlace).toBe(false)
  })

  it('mantem a ordem de auto orient antes do strip', () => {
    // A ordem e imposta no adapter, mas as duas flags tem de chegar la.
    const d = resolveEncodeDirectives(opcoes({ autoOrient: true, metadata: 'remover' }))
    expect(d.autoOrient).toBe(true)
    expect(d.metadata.strip).toBe(true)
  })

  describe('politica de metadados', () => {
    it("'remover' apaga tudo, incluindo o perfil de cor", () => {
      const d = resolveEncodeDirectives(opcoes({ metadata: 'remover' }))
      expect(d.metadata).toEqual({ strip: true, preserveColorProfile: false })
    })

    it("'preservar-cor' apaga tudo excepto o perfil de cor", () => {
      // O valor por defeito. Ver docs/medicoes.md: sem o perfil, um vermelho
      // AdobeRGB(220,30,40) e apresentado como se fosse sRGB e fica mais mate.
      const d = resolveEncodeDirectives(opcoes({ metadata: 'preservar-cor' }))
      expect(d.metadata).toEqual({ strip: true, preserveColorProfile: true })
    })

    it("'manter' nao apaga nada", () => {
      const d = resolveEncodeDirectives(opcoes({ metadata: 'manter' }))
      expect(d.metadata).toEqual({ strip: false, preserveColorProfile: true })
    })

    it('o valor por defeito preserva a cor e apaga o resto', () => {
      expect(resolveEncodeDirectives(opcoes()).metadata).toEqual({
        strip: true,
        preserveColorProfile: true,
      })
    })
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
