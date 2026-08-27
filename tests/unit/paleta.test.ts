// @vitest-environment node
/**
 * Reducao de paleta: a unica alavanca real de tamanho num PNG.
 *
 * Existe porque a otimizacao de PNG nao tinha alavanca nenhuma. Recomprimir um
 * PNG sem perda nao ganha nada, medido aqui mesmo, e o utilizador comparava
 * com ferramentas que cortam dois tercos. A diferenca nao era o encoder: era
 * a tecnica, quantizacao, que nao estava oferecida.
 *
 * Corre o motor real pela porta certa, `MagickImageEngine.convert`, e nao
 * chamadas soltas a biblioteca. Se a quantizacao deixar de ser aplicada, ou
 * passar a ser aplicada onde nao deve, estes testes falham.
 *
 * Gerar as fixtures: npm run fixtures
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'
import { beforeAll, describe, expect, it } from 'vitest'

import { formatoPorId } from '@/config/formats'
import { opcoesPorDefeito } from '@/features/converter/state/jobsReducer'
import type { ConversionOptions } from '@/features/converter/types'
import { MagickImageEngine } from '@/lib/image-engine/magick/MagickImageEngine'
import { resolveEncodeDirectives } from '@/lib/image-engine/options'

const FIXTURES = resolve(process.cwd(), 'tests/fixtures')

function ler(nome: string): ArrayBuffer {
  const caminho = resolve(FIXTURES, nome)
  if (!existsSync(caminho)) {
    throw new Error(`Fixture ${nome} nao existe. Corra: npm run fixtures`)
  }
  const bytes = readFileSync(caminho)
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/**
 * PNG RGBA construido a mao, com metade dos pixeis transparentes.
 *
 * Escrito byte a byte em vez de sair do motor: assim a entrada do teste e
 * conhecida e nao depende de o gerador de fixtures ter mesmo posto alfa.
 */
function pngRgbaComBuracos(largura: number, altura: number): ArrayBuffer {
  const bruto = Buffer.alloc(altura * (1 + largura * 4))
  let o = 0
  for (let y = 0; y < altura; y += 1) {
    bruto[o++] = 0 // filtro None
    for (let x = 0; x < largura; x += 1) {
      bruto[o++] = (x * 7) % 256
      bruto[o++] = (y * 5) % 256
      bruto[o++] = (x * y) % 256
      bruto[o++] = x < largura / 2 ? 0 : 255
    }
  }

  const chunk = (tipo: string, dados: Buffer): Buffer => {
    const comprimento = Buffer.alloc(4)
    comprimento.writeUInt32BE(dados.length)
    const corpo = Buffer.concat([Buffer.from(tipo, 'latin1'), dados])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(corpo) >>> 0)
    return Buffer.concat([comprimento, corpo, crc])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(largura, 0)
  ihdr.writeUInt32BE(altura, 4)
  ihdr[8] = 8 // profundidade por canal
  ihdr[9] = 6 // RGBA


  const ficheiro = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(bruto)),
    chunk('IEND', Buffer.alloc(0)),
  ])
  return ficheiro.buffer.slice(
    ficheiro.byteOffset,
    ficheiro.byteOffset + ficheiro.byteLength,
  ) as ArrayBuffer
}

const motor = new MagickImageEngine()

beforeAll(async () => {
  await motor.initialize(
    new Uint8Array(readFileSync(resolve(process.cwd(), 'public/magick/magick.wasm'))),
  )
}, 60_000)

function comPaleta(cores: number | null): ConversionOptions {
  return { ...opcoesPorDefeito('png'), palette: cores }
}

describe('resolveEncodeDirectives e a paleta', () => {
  it('passa a paleta num formato que a suporta', () => {
    expect(resolveEncodeDirectives(comPaleta(256)).palette).toBe(256)
  })

  it('ignora a paleta num formato com qualidade com perda', () => {
    // Quantizar antes de comprimir um JPEG degrada a imagem sem ganhar bytes.
    // O filtro vive nas diretivas e nao so na interface, porque um valor
    // escolhido num PNG chegaria intacto ao motor depois de mudar o destino.
    const opcoes = { ...opcoesPorDefeito('jpeg'), palette: 64 }
    expect(formatoPorId('jpeg').supportsPalette).toBe(false)
    expect(resolveEncodeDirectives(opcoes).palette).toBeNull()
  })

  it('null quando nao foi pedida', () => {
    expect(resolveEncodeDirectives(comPaleta(null)).palette).toBeNull()
  })

  it('limita valores fora da gama em vez de os passar ao motor', () => {
    expect(resolveEncodeDirectives(comPaleta(9999)).palette).toBe(256)
    expect(resolveEncodeDirectives(comPaleta(1)).palette).toBe(2)
    expect(resolveEncodeDirectives(comPaleta(Number.NaN)).palette).toBeNull()
  })
})

describe('PNG no motor real', () => {
  it('sem paleta, recomprimir nao ganha praticamente nada', async () => {
    // Este numero e a razao de ser da funcionalidade. Se um dia o encoder
    // passar a ganhar de facto, este teste falha e a mensagem da interface
    // tem de ser revista com ele.
    const origem = ler('png-rgb.png')
    const original = origem.byteLength
    const r = await motor.convert(origem, comPaleta(null), { magickFormat: null })

    const ganho = (original - r.bytes.byteLength) / original
    expect(ganho).toBeLessThan(0.02)
  }, 120_000)

  it('com paleta de 256 cores corta mais de metade', async () => {
    const origem = ler('png-rgb.png')
    const original = origem.byteLength
    const r = await motor.convert(origem, comPaleta(256), { magickFormat: null })

    // Medido: 1 684 594 -> 542 040 bytes, 67,8 %. A margem e ampla de
    // proposito, porque o que importa e a ordem de grandeza.
    const ganho = (original - r.bytes.byteLength) / original
    expect(ganho).toBeGreaterThan(0.5)

    // E continua a ser um PNG legivel, com as mesmas dimensoes.
    expect([...r.bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
    const inspecao = await motor.inspect(
      r.bytes.buffer.slice(r.bytes.byteOffset, r.bytes.byteOffset + r.bytes.byteLength) as ArrayBuffer,
      { magickFormat: null },
    )
    expect(inspecao.formatId).toBe('png')
    expect(inspecao.width).toBe(1200)
    expect(inspecao.height).toBe(800)
  }, 120_000)

  it('menos cores dao um ficheiro menor', async () => {
    const origem = ler('png-rgb.png')
    const grande = await motor.convert(origem, comPaleta(256), { magickFormat: null })
    const pequeno = await motor.convert(ler('png-rgb.png'), comPaleta(64), { magickFormat: null })

    expect(pequeno.bytes.byteLength).toBeLessThan(grande.bytes.byteLength)
  }, 120_000)

  it('a transparencia sobrevive a reducao de paleta', async () => {
    // Quantizar um PNG com alfa nao pode transformar o fundo transparente em
    // preto: seria destruir a imagem em silencio, o que a seccao 5.8 proibe.
    // Um logotipo com fundo transparente e exatamente o caso onde reduzir a
    // paleta compensa mais, portanto isto tem de estar coberto.
    //
    // A imagem e construida aqui e nao vem das fixtures de proposito: medido,
    // png-transparencia.png e avif-transparencia.avif tem canal alfa mas
    // estao totalmente opacos (isOpaque=true), por isso nao provavam nada.
    const origem = pngRgbaComBuracos(200, 200)
    const r = await motor.convert(origem, comPaleta(256), { magickFormat: null })
    const saida = r.bytes.buffer.slice(
      r.bytes.byteOffset,
      r.bytes.byteOffset + r.bytes.byteLength,
    ) as ArrayBuffer

    const inspecao = await motor.inspect(saida, { magickFormat: null })
    expect(inspecao.hasAlpha).toBe(true)

    // A paleta guarda o alfa num bloco tRNS. Sem ele, um PNG indexado nao tem
    // transparencia nenhuma, e a verificacao acima passaria com a imagem
    // estragada.
    expect(Buffer.from(r.bytes).toString('latin1')).toContain('tRNS')

    // E continua a valer a pena: medido, 131 942 -> 17 124 bytes.
    expect(r.bytes.byteLength).toBeLessThan(origem.byteLength / 2)
  }, 120_000)

  it('redimensionar e reduzir a paleta ao mesmo tempo mantem as duas coisas', async () => {
    // A ordem importa: quantizar antes de redimensionar fazia o resize
    // interpolar e inventar cores novas, e o ganho desaparecia.
    const origem = ler('png-rgb.png')
    const opcoes: ConversionOptions = {
      ...comPaleta(256),
      resize: { width: 600, height: null, preserveAspectRatio: true, allowUpscale: false },
    }
    const r = await motor.convert(origem, opcoes, { magickFormat: null })

    expect(r.width).toBe(600)
    expect(r.height).toBe(400)
    // Com metade das dimensoes e paleta reduzida, tem de ser muito menor.
    expect(r.bytes.byteLength).toBeLessThan(origem.byteLength / 4)
  }, 120_000)
})
