// @vitest-environment node
/**
 * Redimensionamento: a previsao mostrada na interface e o que o motor faz.
 *
 * Os dois lados estao testados juntos de proposito. Se `calcularSaida`
 * divergisse do motor, a interface prometeria dimensoes que o ficheiro nao
 * teria, e isso e pior do que nao mostrar previsao nenhuma.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  ImageMagick,
  initializeImageMagick,
  Magick,
  MagickFormat,
  MagickGeometry,
  MagickImage,
  MagickReadSettings,
} from '@imagemagick/magick-wasm'

import { calcularSaida } from '@/features/converter/components/ResizeControls'
import { opcoesPorDefeito } from '@/features/converter/state/jobsReducer'
import type { ResizeOptions } from '@/features/converter/types'
import { resolveEncodeDirectives } from '@/lib/image-engine/options'

const ORIGEM = { width: 1200, height: 800 }
let fonte: Uint8Array

beforeAll(async () => {
  await initializeImageMagick(
    new Uint8Array(readFileSync(resolve(process.cwd(), 'public/magick/magick.wasm'))),
  )
  Magick.setRandomSeed(20260101)
  const settings = new MagickReadSettings()
  settings.width = ORIGEM.width
  settings.height = ORIGEM.height
  const seed = MagickImage.create()
  seed.read('plasma:fractal', settings)
  fonte = seed.write(MagickFormat.Png, (d) => new Uint8Array(d))
  seed.dispose()
}, 60_000)

function resize(parcial: Partial<ResizeOptions>): ResizeOptions {
  return { width: null, height: null, preserveAspectRatio: true, allowUpscale: false, ...parcial }
}

/** Corre o resize pelo caminho real: diretivas resolvidas, geometria do motor. */
function dimensoesReais(opcoes: ResizeOptions | null): { width: number; height: number } {
  const diretivas = resolveEncodeDirectives({ ...opcoesPorDefeito('png'), resize: opcoes })

  return ImageMagick.read(fonte, (img) => {
    if (diretivas.resize) {
      const geo = new MagickGeometry(diretivas.resize.width, diretivas.resize.height)
      geo.ignoreAspectRatio = diretivas.resize.ignoreAspectRatio
      geo.greater = diretivas.resize.onlyShrink
      img.resize(geo)
    }
    return { width: img.width, height: img.height }
  })
}

const CASOS: readonly { nome: string; opcoes: ResizeOptions | null; esperado: { width: number; height: number } }[] = [
  {
    nome: 'sem resize, mantem as dimensoes',
    opcoes: null,
    esperado: ORIGEM,
  },
  {
    nome: 'largura 600 com proporcao, altura calculada',
    opcoes: resize({ width: 600 }),
    esperado: { width: 600, height: 400 },
  },
  {
    nome: 'altura 400 com proporcao, largura calculada',
    opcoes: resize({ height: 400 }),
    esperado: { width: 600, height: 400 },
  },
  {
    nome: 'caixa 600x600 com proporcao, cabe dentro',
    opcoes: resize({ width: 600, height: 600 }),
    esperado: { width: 600, height: 400 },
  },
  {
    nome: 'caixa 300x300 com proporcao',
    opcoes: resize({ width: 300, height: 300 }),
    esperado: { width: 300, height: 200 },
  },
  {
    nome: 'dimensoes exatas quando a proporcao e dispensada',
    opcoes: resize({ width: 500, height: 500, preserveAspectRatio: false }),
    esperado: { width: 500, height: 500 },
  },
  {
    nome: 'nao aumenta por defeito',
    opcoes: resize({ width: 2400 }),
    esperado: ORIGEM,
  },
  {
    nome: 'aumenta quando pedido explicitamente',
    opcoes: resize({ width: 2400, allowUpscale: true }),
    esperado: { width: 2400, height: 1600 },
  },
  {
    nome: 'ambas as dimensoes vazias equivale a nao redimensionar',
    opcoes: resize({}),
    esperado: ORIGEM,
  },
]

describe('a previsao da interface coincide com o motor', () => {
  for (const caso of CASOS) {
    it(caso.nome, () => {
      // Os dois lados da mesma moeda: o que dizemos e o que acontece.
      expect(calcularSaida(ORIGEM, caso.opcoes), 'previsao da interface').toEqual(caso.esperado)
      expect(dimensoesReais(caso.opcoes), 'dimensoes produzidas pelo motor').toEqual(caso.esperado)
    })
  }
})

describe('redimensionar reduz o ficheiro', () => {
  it('metade das dimensoes da um ficheiro bastante menor', () => {
    const original = ImageMagick.read(fonte, (img) =>
      img.write(MagickFormat.Png, (d) => d.length),
    )
    const reduzido = ImageMagick.read(fonte, (img) => {
      img.resize(new MagickGeometry(600, 400))
      return img.write(MagickFormat.Png, (d) => d.length)
    })
    expect(reduzido).toBeLessThan(original / 2)
  })
})

describe('limites de entrada', () => {
  it('a proporcao com uma so dimensao usa a outra como ilimitada', () => {
    // Se o limite ausente fosse tratado como zero, a escala seria zero e a
    // imagem colapsava para 1x1.
    expect(calcularSaida(ORIGEM, resize({ width: 600 }))).toEqual({ width: 600, height: 400 })
    expect(calcularSaida(ORIGEM, resize({ height: 400 }))).toEqual({ width: 600, height: 400 })
  })

  it('nunca devolve uma dimensao inferior a 1', () => {
    const minusculo = calcularSaida({ width: 1200, height: 800 }, resize({ width: 1 }))
    expect(minusculo.width).toBeGreaterThanOrEqual(1)
    expect(minusculo.height).toBeGreaterThanOrEqual(1)
  })

  it('uma imagem muito estreita nao colapsa', () => {
    expect(calcularSaida({ width: 3000, height: 10 }, resize({ width: 300 }))).toEqual({
      width: 300,
      height: 1,
    })
  })
})
