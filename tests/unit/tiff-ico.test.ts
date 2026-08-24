// @vitest-environment node
/**
 * TIFF e ICO contra o motor real.
 *
 * Os dois trazem uma armadilha cada, e as duas foram medidas e nao lidas:
 *
 *  - um ICO nao se le sem formato explicito, e um ICO de varios tamanhos lido
 *    pela via de imagem unica devolve o MENOR;
 *  - um ICO escrito acima de 256 px declara 256 no ICONDIRENTRY, portanto
 *    mente sobre as proprias dimensoes.
 *
 * Gerar as fixtures: npm run fixtures
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

import { MagickImageCollection, MagickFormat, MagickReadSettings } from '@imagemagick/magick-wasm'

import { formatoPorId } from '@/config/formats'
import { opcoesPorDefeito } from '@/features/converter/state/jobsReducer'
import { MagickImageEngine } from '@/lib/image-engine/magick/MagickImageEngine'

const FIXTURES = resolve(process.cwd(), 'tests/fixtures')

function ler(nome: string): ArrayBuffer {
  const caminho = resolve(FIXTURES, nome)
  if (!existsSync(caminho)) throw new Error(`Fixture ${nome} nao existe. Corra: npm run fixtures`)
  const bytes = readFileSync(caminho)
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

const HINT_ICO = { magickFormat: formatoPorId('ico').magickFormat }
const SEM_HINT = { magickFormat: null }

const motor = new MagickImageEngine()

beforeAll(async () => {
  await motor.initialize(
    new Uint8Array(readFileSync(resolve(process.cwd(), 'public/magick/magick.wasm'))),
  )
}, 60_000)

describe('TIFF', () => {
  it('e lido sem precisar de formato explicito', async () => {
    const i = await motor.inspect(ler('tiff-normal.tif'), SEM_HINT)
    expect(i.formatId).toBe('tiff')
    expect(i.width).toBe(1200)
    expect(i.frameCount).toBe(1)
  })

  it('converte para WebP com uma reducao grande', async () => {
    const original = ler('tiff-normal.tif').byteLength
    const r = await motor.convert(ler('tiff-normal.tif'), opcoesPorDefeito('webp'), SEM_HINT)
    expect(r.formatId).toBe('webp')
    // Um TIFF sem compressao contra WebP q80: a diferenca e de ordens de grandeza.
    expect(r.bytes.length).toBeLessThan(original / 10)
  })

  it('a miniatura vem do motor, porque o browser nao descodifica TIFF', async () => {
    expect(formatoPorId('tiff').browserDecodable).toBe(false)

    const m = await motor.thumbnail(ler('tiff-normal.tif'), SEM_HINT, 720)
    expect(m.formatId).toBe('webp')
    expect(m.width).toBe(720)
    // 1200x800 reduzido a 720 de largura da 480 de altura.
    expect(m.height).toBe(480)
    expect(Buffer.from(m.bytes.subarray(0, 4)).toString('latin1')).toBe('RIFF')
  })

  it('a miniatura nunca aumenta uma imagem pequena', async () => {
    const m = await motor.thumbnail(ler('ico-simples.ico'), HINT_ICO, 720)
    expect(m.width).toBe(64)
    expect(m.height).toBe(64)
  })

  it('as paginas sobrevivem de TIFF para TIFF', async () => {
    const r = await motor.convert(ler('tiff-multipagina.tiff'), opcoesPorDefeito('tiff'), SEM_HINT)
    expect(r.frameCount).toBe(3)
    expect(r.outputFrameCount).toBe(3)
  })

  it('para WebP fica a primeira pagina, e nao uma animacao', async () => {
    // Paginas e animacao nao sao a mesma coisa: transformar paginas de um
    // documento numa animacao seria inventar significado.
    const r = await motor.convert(ler('tiff-multipagina.tiff'), opcoesPorDefeito('webp'), SEM_HINT)
    expect(r.frameCount).toBe(3)
    expect(r.outputFrameCount).toBe(1)
  })
})

describe('ICO', () => {
  it('o motor recusa ler um ICO sem formato explicito', async () => {
    // A razao de existir requiresFormatHint no registry.
    await expect(motor.inspect(ler('ico-simples.ico'), SEM_HINT)).rejects.toThrow(
      /NoDecodeDelegate/,
    )
  })

  it('com o formato declarado le sem problemas', async () => {
    const i = await motor.inspect(ler('ico-simples.ico'), HINT_ICO)
    expect(i.formatId).toBe('ico')
    expect(i.width).toBe(64)
  })

  it('inspect reporta o MAIOR tamanho de um ICO com varios', async () => {
    // A via de imagem unica do motor devolvia 16x16, o primeiro fotograma. A
    // interface mostraria 16 px e o utilizador receberia 256.
    const i = await motor.inspect(ler('ico-multi.ico'), HINT_ICO)
    expect(i.frameCount).toBe(3)
    expect(i.width).toBe(256)
    expect(i.height).toBe(256)
  })

  it('converter um ICO de varios tamanhos usa o maior', async () => {
    const r = await motor.convert(ler('ico-multi.ico'), opcoesPorDefeito('png'), HINT_ICO)
    expect(r.width).toBe(256)
    expect(r.outputFrameCount).toBe(1)
  })

  it('os tamanhos sobrevivem de ICO para ICO', async () => {
    const r = await motor.convert(ler('ico-multi.ico'), opcoesPorDefeito('ico'), HINT_ICO)
    expect(r.outputFrameCount).toBe(3)
  })
})

describe('limite de 256 px do ICO', () => {
  /** Largura declarada no ICONDIRENTRY. 0 significa 256 na norma. */
  function larguraDeclarada(bytes: Uint8Array): number {
    return bytes[6] === 0 ? 256 : bytes[6]!
  }

  it('reduz uma imagem grande para caber em 256', async () => {
    // O JPEG de referencia tem 1200x800. Sem limite, o motor escreveria 1200 px
    // e o ficheiro declararia 256.
    const r = await motor.convert(ler('jpeg-normal.jpg'), opcoesPorDefeito('ico'), SEM_HINT)
    expect(r.width).toBe(256)
    expect(r.height).toBe(171)
    expect(larguraDeclarada(r.bytes)).toBe(256)
  })

  it('o ficheiro nunca declara dimensoes diferentes das que tem', async () => {
    const r = await motor.convert(ler('jpeg-normal.jpg'), opcoesPorDefeito('ico'), SEM_HINT)

    const colecao = MagickImageCollection.create()
    try {
      colecao.ping(r.bytes, new MagickReadSettings({ format: MagickFormat.Ico }))
      const real = colecao[0]!
      // A largura real e a declarada tem de coincidir. Era isto que falhava
      // acima de 256: 320 px reais declarados como 256.
      expect(real.width).toBe(larguraDeclarada(r.bytes))
    } finally {
      colecao.dispose()
    }
  })

  it('nao aumenta um icone pequeno ate ao limite', async () => {
    // 64 px continua 64: o limite e um teto, nao um objetivo.
    const r = await motor.convert(ler('ico-simples.ico'), opcoesPorDefeito('ico'), HINT_ICO)
    expect(r.width).toBe(64)
  })
})
