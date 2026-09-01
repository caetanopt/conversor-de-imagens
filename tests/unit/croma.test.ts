// @vitest-environment node
/**
 * Subamostragem de croma: a maior alavanca de tamanho num JPEG.
 *
 * Existe porque o ImageMagick HERDA a subamostragem do ficheiro de origem
 * quando ninguem lhe diz nada. Uma fotografia exportada em 4:4:4 saia em
 * 4:4:4, e a otimizacao rendia 37,8 % em vez de 59,6 % na mesma imagem.
 *
 * O teste nao se contenta com o tamanho: le o marcador SOF do JPEG produzido e
 * confirma o fator real. Sem isso, um define ignorado pelo motor passava sem
 * ninguem notar, que e exactamente como este defeito viveu ate agora.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import {
  initializeImageMagick,
  Magick,
  MagickFormat,
  MagickImage,
  MagickReadSettings,
} from '@imagemagick/magick-wasm'

import { formatoPorId } from '@/config/formats'
import { opcoesPorDefeito } from '@/features/converter/state/jobsReducer'
import type { ChromaSubsampling, ConversionOptions } from '@/features/converter/types'
import { MagickImageEngine } from '@/lib/image-engine/magick/MagickImageEngine'
import { CROMA_POR_DEFEITO, resolveEncodeDirectives } from '@/lib/image-engine/options'

vi.setConfig({ testTimeout: 120_000 })

const motor = new MagickImageEngine()
let original: ArrayBuffer

beforeAll(async () => {
  const wasm = new Uint8Array(readFileSync(resolve(process.cwd(), 'public/magick/magick.wasm')))
  await initializeImageMagick(wasm)
  await motor.initialize(wasm)
  Magick.setRandomSeed(20260101)

  // Um JPEG em 4:4:4, que e o caso que expunha o defeito: sem semente o
  // `plasma` nao e deterministico e o teste comparava imagens diferentes.
  const settings = new MagickReadSettings()
  settings.width = 800
  settings.height = 600
  const semente = MagickImage.create()
  semente.read('plasma:rgb(150,190,230)-rgb(60,80,50)', settings)
  semente.blur(0, 1.2)
  semente.settings.setDefine(MagickFormat.Jpeg, 'sampling-factor', '4:4:4')
  const bytes = semente.write(MagickFormat.Jpeg, (b) => new Uint8Array(b))
  semente.dispose()
  original = bytes.slice().buffer as ArrayBuffer
})

/**
 * Le o fator de subamostragem do marcador SOF.
 *
 * O primeiro componente e a luminancia: 2x2 significa croma a metade em cada
 * eixo, ou seja 4:2:0; 1x1 significa croma na resolucao total, 4:4:4.
 */
function subamostragem(bytes: Uint8Array): string {
  let i = 2
  while (i < bytes.length - 11) {
    if (bytes[i] !== 0xff) return 'estrutura inesperada'
    const marcador = bytes[i + 1]!
    if (marcador === 0xc0 || marcador === 0xc1 || marcador === 0xc2) {
      if (bytes[i + 9]! < 3) return 'monocromatico'
      const h = (bytes[i + 11]! >> 4) & 0x0f
      const v = bytes[i + 11]! & 0x0f
      if (h === 2 && v === 2) return '4:2:0'
      if (h === 2 && v === 1) return '4:2:2'
      if (h === 1 && v === 1) return '4:4:4'
      return `${h}x${v}`
    }
    if (marcador === 0xd8 || (marcador >= 0xd0 && marcador <= 0xd9)) {
      i += 2
      continue
    }
    i += 2 + ((bytes[i + 2]! << 8) | bytes[i + 3]!)
  }
  return 'SOF nao encontrado'
}

function comCroma(chroma: ChromaSubsampling): ConversionOptions {
  return { ...opcoesPorDefeito('jpeg'), chroma }
}

describe('as diretivas declaram sempre o croma', () => {
  it('num JPEG o define vai sempre, mesmo com o valor por defeito', () => {
    // Tem de ir sempre: e o silencio que fazia o motor herdar o 4:4:4 da
    // origem. Um define "so quando difere do defeito" reintroduzia o defeito.
    const defines = resolveEncodeDirectives(comCroma(CROMA_POR_DEFEITO)).defines
    expect(defines).toContainEqual({ format: 'JPEG', name: 'sampling-factor', value: '4:2:0' })
  })

  it('respeita a escolha de resolucao total', () => {
    const defines = resolveEncodeDirectives(comCroma('4:4:4')).defines
    expect(defines).toContainEqual({ format: 'JPEG', name: 'sampling-factor', value: '4:4:4' })
  })

  it('nao vai para formatos que nao o expoem', () => {
    for (const formato of ['png', 'webp', 'avif'] as const) {
      expect(formatoPorId(formato).supportsChromaSubsampling).toBe(false)
      const opcoes = { ...opcoesPorDefeito(formato), chroma: '4:4:4' as const }
      const nomes = resolveEncodeDirectives(opcoes).defines.map((d) => d.name)
      expect(nomes).not.toContain('sampling-factor')
    }
  })
})

describe('JPEG no motor real', () => {
  it('por defeito produz 4:2:0, mesmo com a origem em 4:4:4', async () => {
    expect(subamostragem(new Uint8Array(original))).toBe('4:4:4')

    const r = await motor.convert(original, comCroma(CROMA_POR_DEFEITO), { magickFormat: null })
    expect(subamostragem(r.bytes)).toBe('4:2:0')
  })

  it('a escolha de resolucao total chega ao ficheiro', async () => {
    const r = await motor.convert(original, comCroma('4:4:4'), { magickFormat: null })
    expect(subamostragem(r.bytes)).toBe('4:4:4')
  })

  it('4:2:0 corta um pedaco grande em relacao a 4:4:4', async () => {
    const a420 = await motor.convert(original, comCroma('4:2:0'), { magickFormat: null })
    const a444 = await motor.convert(original, comCroma('4:4:4'), { magickFormat: null })

    // Medido num JPEG de 1600x1200: 168 656 contra 259 520 bytes, ou seja
    // 4:4:4 custa mais metade. A margem do teste e ampla de proposito, porque
    // o que importa e a ordem de grandeza e nao o numero exacto.
    expect(a420.bytes.byteLength).toBeLessThan(a444.bytes.byteLength * 0.8)
  })
})
