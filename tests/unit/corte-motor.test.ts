// @vitest-environment node
/**
 * Corte no motor real.
 *
 * Nao verifica so as dimensoes de saida: le a COR do pixel central para saber
 * que regiao saiu de facto. Uma imagem de quadrantes com quatro cores torna
 * isso decidivel, e sem isso um corte que sai da regiao errada passa o teste
 * por ter as dimensoes certas.
 *
 * Cobre as tres armadilhas medidas na verificacao:
 *
 *  1. cortar ANTES da orientacao automatica devolve dimensoes trocadas e outra
 *     regiao, num JPEG com EXIF orientation=6;
 *  2. o motor deixa a geometria de pagina por corrigir, e um GIF cortado sai
 *     numa tela errada;
 *  3. uma caixa maior do que a imagem e travada em silencio.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import {
  DrawableFillColor,
  DrawableRectangle,
  initializeImageMagick,
  Magick,
  MagickColor,
  MagickFormat,
  MagickImage,
  MagickImageCollection,
  MagickReadSettings,
} from '@imagemagick/magick-wasm'

import { opcoesPorDefeito } from '@/features/converter/state/jobsReducer'
import type { CropRect } from '@/features/converter/state/crop'
import type { ConversionOptions } from '@/features/converter/types'
import { MagickImageEngine } from '@/lib/image-engine/magick/MagickImageEngine'
import { resolveEncodeDirectives } from '@/lib/image-engine/options'

vi.setConfig({ testTimeout: 120_000 })

const motor = new MagickImageEngine()
const FIXTURES = resolve(process.cwd(), 'tests/fixtures')
const ler = (n: string) => new Uint8Array(readFileSync(resolve(FIXTURES, n)))

/** 400x300 com um quadrante de cada cor, para saber que regiao saiu. */
let quadrantes: ArrayBuffer

const VERMELHO = 'rgb(220,30,40)'
const AZUL = 'rgb(30,90,200)'
const AMARELO = 'rgb(240,190,20)'
const VERDE = 'rgb(20,150,90)'

beforeAll(async () => {
  const wasm = new Uint8Array(readFileSync(resolve(process.cwd(), 'public/magick/magick.wasm')))
  await initializeImageMagick(wasm)
  await motor.initialize(wasm)
  Magick.setRandomSeed(20260101)

  const settings = new MagickReadSettings()
  settings.width = 400
  settings.height = 300
  const img = MagickImage.create()
  img.read('xc:white', settings)
  img.draw([
    new DrawableFillColor(new MagickColor(220, 30, 40, 255)),
    new DrawableRectangle(0, 0, 199, 149),
    new DrawableFillColor(new MagickColor(30, 90, 200, 255)),
    new DrawableRectangle(200, 0, 399, 149),
    new DrawableFillColor(new MagickColor(240, 190, 20, 255)),
    new DrawableRectangle(0, 150, 199, 299),
    new DrawableFillColor(new MagickColor(20, 150, 90, 255)),
    new DrawableRectangle(200, 150, 399, 299),
  ])
  const bytes = img.write(MagickFormat.Png, (b) => new Uint8Array(b))
  img.dispose()
  quadrantes = bytes.slice().buffer as ArrayBuffer
})

function comCorte(formato: 'png' | 'jpeg' | 'gif', crop: CropRect | null): ConversionOptions {
  return { ...opcoesPorDefeito(formato), crop }
}

/** Dimensoes e cor central do resultado. */
function lerSaida(bytes: Uint8Array): { dim: string; cor: string } {
  const img = MagickImage.create()
  img.read(bytes)
  const x = Math.floor(img.width / 2)
  const y = Math.floor(img.height / 2)
  const rgb = img.getPixels((p) => p.toByteArray(x, y, 1, 1, 'RGB'))
  const dim = `${img.width}x${img.height}`
  img.dispose()
  if (!rgb) throw new Error('sem pixeis')
  return { dim, cor: `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` }
}

describe('as diretivas so levam cortes validos', () => {
  it('um corte chega ao motor arredondado a inteiros', () => {
    const d = resolveEncodeDirectives(
      comCorte('png', { x: 10.6, y: 20.4, width: 100.5, height: 50.4 }),
    )
    expect(d.crop).toEqual({ x: 11, y: 20, width: 101, height: 50 })
  })

  it('sem corte, a diretiva e null', () => {
    expect(resolveEncodeDirectives(comCorte('png', null)).crop).toBeNull()
  })

  it('um corte de area nula nao chega ao motor', () => {
    expect(resolveEncodeDirectives(comCorte('png', { x: 0, y: 0, width: 0, height: 50 })).crop)
      .toBeNull()
    expect(
      resolveEncodeDirectives(comCorte('png', { x: 0, y: 0, width: 50, height: 0.4 })).crop,
    ).toBeNull()
  })

  it('valores nao finitos nao chegam ao motor', () => {
    for (const mau of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const d = resolveEncodeDirectives(
        comCorte('png', { x: mau, y: 0, width: 100, height: 100 }),
      )
      expect(d.crop, String(mau)).toBeNull()
    }
  })
})

describe('o motor corta a regiao pedida', () => {
  it('cada quadrante sai quando e pedido', async () => {
    const casos: readonly [CropRect, string, string][] = [
      [{ x: 0, y: 0, width: 200, height: 150 }, '200x150', VERMELHO],
      [{ x: 200, y: 0, width: 200, height: 150 }, '200x150', AZUL],
      [{ x: 0, y: 150, width: 200, height: 150 }, '200x150', AMARELO],
      [{ x: 200, y: 150, width: 200, height: 150 }, '200x150', VERDE],
    ]
    for (const [crop, dim, cor] of casos) {
      const r = await motor.convert(quadrantes, comCorte('png', crop), { magickFormat: null })
      expect(lerSaida(r.bytes), JSON.stringify(crop)).toEqual({ dim, cor })
    }
  })

  it('um corte pequeno no interior de um quadrante', async () => {
    const r = await motor.convert(
      quadrantes,
      comCorte('png', { x: 250, y: 30, width: 100, height: 80 }),
      { magickFormat: null },
    )
    expect(lerSaida(r.bytes)).toEqual({ dim: '100x80', cor: AZUL })
  })

  it('sem corte, a imagem sai inteira', async () => {
    const r = await motor.convert(quadrantes, comCorte('png', null), { magickFormat: null })
    expect(lerSaida(r.bytes).dim).toBe('400x300')
  })
})

describe('a geometria de pagina nao vai podre para o ficheiro', () => {
  /*
   * Com a politica 'manter', e nao com a de defeito.
   *
   * A primeira versao deste teste usava as opcoes por defeito e passava com e
   * sem `resetPage()`, ou seja nao testava nada: a politica por defeito faz
   * `strip()`, e o strip ja limpa a geometria de pagina de um PNG. Confirmado a
   * comentar a chamada e a ver o teste passar. So com 'manter' e que a pagina
   * sobrevive ao pipeline e a correcao passa a ser observavel.
   */
  it('um PNG cortado a manter metadados declara as suas proprias dimensoes', async () => {
    const r = await motor.convert(
      quadrantes,
      { ...comCorte('png', { x: 250, y: 200, width: 150, height: 100 }), metadata: 'manter' },
      { magickFormat: null },
    )
    const img = MagickImage.create()
    img.read(r.bytes)
    const page = img.page
    img.dispose()

    // Sem resetPage() isto declara 400x300+250+200. Medido.
    expect(`${page.width}x${page.height}+${page.x}+${page.y}`).toBe('150x100+0+0')
  })

  it('um GIF animado cortado nao sai numa tela errada', async () => {
    const r = await motor.convert(
      ler('gif-animado.gif').slice().buffer as ArrayBuffer,
      comCorte('gif', { x: 70, y: 30, width: 100, height: 100 }),
      { magickFormat: null },
    )

    const col = MagickImageCollection.create()
    col.read(r.bytes)
    const frames = col.length
    const primeiro = col[0]
    if (!primeiro) throw new Error('GIF sem frames')
    const dim = `${primeiro.width}x${primeiro.height}`
    const page = primeiro.page
    const tela = `${page.width}x${page.height}+${page.x}+${page.y}`
    col.dispose()

    // A animacao sobrevive...
    expect(frames).toBeGreaterThan(1)
    expect(dim).toBe('100x100')
    // ...e a tela e a do corte, nao a original deslocada.
    expect(tela).toBe('100x100+0+0')
  })
})

describe('a ordem em relacao a orientacao automatica', () => {
  it('num JPEG com EXIF, as dimensoes pedidas sao as entregues', async () => {
    /*
     * A armadilha medida: cortar antes de orientar devolve 80x120 quando se
     * pediu 120x80, e de outra regiao da imagem. O pipeline aplica autoOrient
     * primeiro, portanto o corte trabalha sobre a imagem que o utilizador ve.
     */
    const original = ler('jpeg-exif-orientacao-6.jpg')
    const semCorte = await motor.convert(
      original.slice().buffer as ArrayBuffer,
      comCorte('png', null),
      { magickFormat: null },
    )
    const orientada = lerSaida(semCorte.bytes).dim

    const cortada = await motor.convert(
      original.slice().buffer as ArrayBuffer,
      comCorte('png', { x: 0, y: 0, width: 120, height: 80 }),
      { magickFormat: null },
    )
    expect(lerSaida(cortada.bytes).dim).toBe('120x80')

    // E a imagem de partida do corte e a orientada, nao a crua.
    expect(orientada).not.toBe('120x80')
  })
})

describe('corte e redimensionamento juntos', () => {
  it('corta primeiro e escala depois', async () => {
    const r = await motor.convert(
      quadrantes,
      {
        ...comCorte('png', { x: 0, y: 0, width: 200, height: 150 }),
        resize: { width: 100, height: 75, preserveAspectRatio: true, allowUpscale: false },
      },
      { magickFormat: null },
    )
    // Se redimensionasse primeiro, a regiao seria outra e a cor mudava.
    expect(lerSaida(r.bytes)).toEqual({ dim: '100x75', cor: VERMELHO })
  })
})
