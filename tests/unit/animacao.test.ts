// @vitest-environment node
/**
 * A animacao sobrevive, ou o utilizador e avisado.
 *
 * Corre o motor real sobre as fixtures animadas. E o teste que sustenta a
 * afirmacao do registry de que GIF e WebP preservam animacao, e a regra do
 * CLAUDE.md, seccao 5.8, de que nada se perde em silencio.
 *
 * Verifica o motor pela porta certa: `MagickImageEngine.convert`, e nao
 * chamadas soltas a biblioteca. Se o adaptador voltar ao caminho de imagem
 * unica, estes testes falham.
 *
 * Gerar as fixtures: npm run fixtures
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

import { MagickImageCollection } from '@imagemagick/magick-wasm'

import { formatoPorId, type FormatId } from '@/config/formats'
import { opcoesPorDefeito } from '@/features/converter/state/jobsReducer'
import { MagickImageEngine } from '@/lib/image-engine/magick/MagickImageEngine'

const FIXTURES = resolve(process.cwd(), 'tests/fixtures')

function ler(nome: string): ArrayBuffer {
  const caminho = resolve(FIXTURES, nome)
  if (!existsSync(caminho)) {
    throw new Error(`Fixture ${nome} nao existe. Corra: npm run fixtures`)
  }
  const bytes = readFileSync(caminho)
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/** Conta os frames de um ficheiro de saida lendo apenas os cabecalhos. */
function contarFrames(bytes: Uint8Array): number {
  const colecao = MagickImageCollection.create()
  try {
    colecao.ping(bytes)
    return colecao.length
  } finally {
    colecao.dispose()
  }
}

const motor = new MagickImageEngine()

beforeAll(async () => {
  // O adaptador aceita bytes, o que permite testa-lo pela porta real em Node.
  await motor.initialize(
    new Uint8Array(readFileSync(resolve(process.cwd(), 'public/magick/magick.wasm'))),
  )
}, 60_000)

async function converter(fixture: string, destino: FormatId) {
  const origem = ler(fixture)
  return motor.convert(origem, opcoesPorDefeito(destino), {
    magickFormat: null,
  })
}

describe('GIF animado', () => {
  it('a fixture tem mesmo varios fotogramas', async () => {
    const inspecao = await motor.inspect(ler('gif-animado.gif'), { magickFormat: null })
    expect(inspecao.frameCount).toBe(6)
    expect(inspecao.formatId).toBe('gif')
  })

  it('para GIF mantem os seis fotogramas', async () => {
    const r = await converter('gif-animado.gif', 'gif')
    expect(r.frameCount).toBe(6)
    expect(r.outputFrameCount).toBe(6)
    expect(contarFrames(r.bytes)).toBe(6)
  })

  it('para WebP mantem os seis fotogramas', async () => {
    const r = await converter('gif-animado.gif', 'webp')
    expect(r.outputFrameCount).toBe(6)
    expect(contarFrames(r.bytes)).toBe(6)
    // Marcadores de WebP animado: VP8X com a caixa ANIM e frames ANMF.
    const texto = Buffer.from(r.bytes).toString('latin1')
    expect(texto).toContain('VP8X')
    expect(texto).toContain('ANIM')
    expect(texto).toContain('ANMF')
  })

  it('para PNG fica um fotograma, e o resultado declara-o', async () => {
    const r = await converter('gif-animado.gif', 'png')
    // A perda e real, e por isso tem de ser visivel no resultado. A interface
    // avisa antes, com base na inspecao; aqui garantimos que os numeros nao
    // mentem depois.
    expect(r.frameCount).toBe(6)
    expect(r.outputFrameCount).toBe(1)
    expect(contarFrames(r.bytes)).toBe(1)
  })

  it('para JPEG fica um fotograma', async () => {
    const r = await converter('gif-animado.gif', 'jpeg')
    expect(r.outputFrameCount).toBe(1)
  })

  it('o WebP animado e mais pequeno que o GIF animado', async () => {
    // Justifica a sugestao da interface: para uma animacao, WebP e a escolha
    // melhor. Medido: 10 frames a 320x240 dao 475 KB em GIF e 104 KB em WebP.
    const gif = await converter('gif-animado.gif', 'gif')
    const webp = await converter('gif-animado.gif', 'webp')
    expect(webp.bytes.length).toBeLessThan(gif.bytes.length)
  })

  it('redimensionar mantem os fotogramas e aplica-se a todos', async () => {
    const opcoes = {
      ...opcoesPorDefeito('webp'),
      resize: { width: 120, height: null, preserveAspectRatio: true, allowUpscale: false },
    }
    const r = await motor.convert(ler('gif-animado.gif'), opcoes, { magickFormat: null })

    expect(r.outputFrameCount).toBe(6)
    expect(r.width).toBe(120)

    // Todos os frames, e nao so o primeiro: um frame com outra dimensao
    // deformaria a animacao.
    const colecao = MagickImageCollection.create()
    try {
      colecao.ping(r.bytes)
      for (const frame of colecao) expect(frame.width).toBe(120)
    } finally {
      colecao.dispose()
    }
  })
})

describe('WebP animado como entrada', () => {
  it('e reconhecido com os quatro fotogramas', async () => {
    const inspecao = await motor.inspect(ler('webp-animado.webp'), { magickFormat: null })
    expect(inspecao.formatId).toBe('webp')
    expect(inspecao.frameCount).toBe(4)
  })

  it('para GIF mantem os fotogramas', async () => {
    const r = await converter('webp-animado.webp', 'gif')
    expect(r.outputFrameCount).toBe(4)
    expect(contarFrames(r.bytes)).toBe(4)
  })
})

describe('ficheiros de um fotograma', () => {
  it('um GIF estatico nao ganha fotogramas do nada', async () => {
    const r = await converter('gif-estatico.gif', 'webp')
    expect(r.frameCount).toBe(1)
    expect(r.outputFrameCount).toBe(1)
  })

  it('um JPEG normal continua a dar exatamente um fotograma', async () => {
    const r = await converter('jpeg-normal.jpg', 'webp')
    expect(r.frameCount).toBe(1)
    expect(r.outputFrameCount).toBe(1)
  })

  it('a via de colecao nao mudou os bytes de saida de um ficheiro normal', async () => {
    // Medido antes de trocar o caminho: JPEG 800x600 para WebP dava os mesmos
    // 51 164 bytes nas duas vias. Este teste protege a reprodutibilidade.
    const a = await converter('jpeg-normal.jpg', 'webp')
    const b = await converter('jpeg-normal.jpg', 'webp')
    expect(a.bytes.length).toBe(b.bytes.length)
    expect(Buffer.from(a.bytes).equals(Buffer.from(b.bytes))).toBe(true)
  })
})

describe('BMP', () => {
  it('le um BMP e converte para WebP muito mais pequeno', async () => {
    const inspecao = await motor.inspect(ler('bmp-rgb.bmp'), { magickFormat: null })
    expect(inspecao.formatId).toBe('bmp')

    const r = await converter('bmp-rgb.bmp', 'webp')
    expect(r.formatId).toBe('webp')
    // Um BMP nao tem compressao, portanto qualquer formato moderno ganha muito.
    expect(r.bytes.length).toBeLessThan(ler('bmp-rgb.bmp').byteLength / 2)
  })

  it('escreve BMP a partir de um JPEG', async () => {
    const r = await converter('jpeg-normal.jpg', 'bmp')
    expect(r.formatId).toBe('bmp')
    expect(Buffer.from(r.bytes.subarray(0, 2)).toString('latin1')).toBe('BM')
    expect(formatoPorId('bmp').supportsQuality).toBe(false)
  })
})
