// @vitest-environment node
/**
 * Remocao de fundo.
 *
 * O teste nao se contenta com "produziu bytes". Le o canal alfa da imagem
 * produzida e verifica quatro coisas que a experiencia mostrou serem os pontos
 * onde isto se estraga:
 *
 *  1. o fundo desaparece de facto;
 *  2. um recorte da cor do fundo DENTRO do objeto sobrevive, que e a diferenca
 *     entre preencher a partir dos cantos e aplicar um limiar global;
 *  3. um objeto de cor proxima do fundo NAO desaparece na tolerancia por
 *     defeito, que era a falha destrutiva encontrada na calibracao;
 *  4. o formato de destino sem canal alfa nao recebe a instrucao.
 *
 * Sem ler o alfa, um `floodFill` ignorado pelo motor passava sem ninguem notar.
 * E foi exactamente o que aconteceu: a sobrecarga numerica de `floodFill` e um
 * no-op silencioso, e so uma medicao de pixeis o revelou.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import {
  Channels,
  DrawableFillColor,
  DrawableRoundRectangle,
  initializeImageMagick,
  Magick,
  MagickColor,
  MagickColors,
  MagickFormat,
  MagickImage,
  MagickReadSettings,
  PixelChannel,
  type IMagickImage,
} from '@imagemagick/magick-wasm'

import { formatoPorId } from '@/config/formats'
import { opcoesPorDefeito } from '@/features/converter/state/jobsReducer'
import type { BackgroundTolerance, ConversionOptions } from '@/features/converter/types'
import { MagickImageEngine } from '@/lib/image-engine/magick/MagickImageEngine'
import { FUNDO_POR_DEFEITO, resolveEncodeDirectives } from '@/lib/image-engine/options'

vi.setConfig({ testTimeout: 120_000 })

const motor = new MagickImageEngine()

/** Fundo branco, objeto vermelho, e um recorte BRANCO dentro do objeto. */
let comRecorteInterior: ArrayBuffer
/** Fundo branco, objeto de um cinzento muito proximo do branco. */
let objetoQuaseBranco: ArrayBuffer
/** Fundo fotografico, sem regiao uniforme nenhuma. */
let fundoComplexo: ArrayBuffer

const LARGURA = 400
const ALTURA = 300

function comFundo(
  formato: Parameters<typeof opcoesPorDefeito>[0],
  background: BackgroundTolerance | null,
): ConversionOptions {
  return { ...opcoesPorDefeito(formato), background }
}

function png(desenhar: (img: IMagickImage) => void): ArrayBuffer {
  const img = MagickImage.create()
  desenhar(img)
  const bytes = img.write(MagickFormat.Png, (b) => new Uint8Array(b))
  img.dispose()
  return bytes.slice().buffer as ArrayBuffer
}

beforeAll(async () => {
  const wasm = new Uint8Array(readFileSync(resolve(process.cwd(), 'public/magick/magick.wasm')))
  await initializeImageMagick(wasm)
  await motor.initialize(wasm)
  Magick.setRandomSeed(20260101)

  comRecorteInterior = png((img) => {
    img.read('xc:white', comDimensoes())
    img.draw([
      new DrawableFillColor(MagickColors.Crimson),
      new DrawableRoundRectangle(110, 70, 290, 230, 24, 24),
      // O brilho branco de um produto fotografado sobre branco.
      new DrawableFillColor(MagickColors.White),
      new DrawableRoundRectangle(140, 95, 190, 130, 8, 8),
    ])
  })

  objetoQuaseBranco = png((img) => {
    img.read('xc:white', comDimensoes())
    img.draw([
      new DrawableFillColor(new MagickColor(238, 238, 238, 255)),
      new DrawableRoundRectangle(110, 70, 290, 230, 24, 24),
    ])
  })

  fundoComplexo = png((img) => {
    img.read('plasma:rgb(200,150,100)-rgb(40,70,120)', comDimensoes())
    img.draw([
      new DrawableFillColor(MagickColors.Black),
      new DrawableRoundRectangle(120, 80, 280, 220, 20, 20),
    ])
  })
})

function comDimensoes(): MagickReadSettings {
  const s = new MagickReadSettings()
  s.width = LARGURA
  s.height = ALTURA
  return s
}

/**
 * Le o canal alfa do resultado, pixel a pixel.
 *
 * Pela leitura directa e nao pela media: aqui o que interessa e onde os pixeis
 * transparentes estao, e nao so quantos sao. A media serve ao motor, que corre
 * em cada conversao; um teste pode pagar a leitura completa de 400x300.
 */
function alfaDe(bytes: Uint8Array): {
  readonly largura: number
  readonly altura: number
  readonly valores: Uint8Array
} {
  const img = MagickImage.create()
  img.read(bytes)
  const largura = img.width
  const altura = img.height
  const valores = img.getPixels((p) => p.toByteArray(0, 0, largura, altura, 'A'))
  img.dispose()
  if (!valores || valores.length !== largura * altura) {
    throw new Error(`canal alfa inesperado: ${valores ? valores.length : 'null'}`)
  }
  return { largura, altura, valores: new Uint8Array(valores) }
}

const OPACO = 200
const TRANSPARENTE = 32

function percentagemTransparente(a: ReturnType<typeof alfaDe>): number {
  let n = 0
  for (const v of a.valores) if (v < TRANSPARENTE) n++
  return (n / a.valores.length) * 100
}

function alfaEm(a: ReturnType<typeof alfaDe>, x: number, y: number): number {
  return a.valores[y * a.largura + x]!
}

describe('as diretivas so pedem recorte onde ha canal alfa', () => {
  it('num PNG a tolerancia chega ao motor', () => {
    expect(resolveEncodeDirectives(comFundo('png', 'exata')).background).toEqual({
      tolerancePercent: 2,
    })
    expect(resolveEncodeDirectives(comFundo('png', 'normal')).background).toEqual({
      tolerancePercent: 8,
    })
    expect(resolveEncodeDirectives(comFundo('png', 'ampla')).background).toEqual({
      tolerancePercent: 18,
    })
  })

  it('desligada devolve null', () => {
    expect(resolveEncodeDirectives(comFundo('png', null)).background).toBeNull()
  })

  it('num JPEG nao vai, porque nao ha onde guardar a transparencia', () => {
    expect(formatoPorId('jpeg').supportsAlpha).toBe(false)
    // A opcao chega preenchida, como chegaria se o utilizador a tivesse ligado
    // num PNG e mudado o destino a seguir.
    expect(resolveEncodeDirectives(comFundo('jpeg', 'normal')).background).toBeNull()
  })

  it('a tolerancia por defeito e a que nao destroi objetos claros', () => {
    expect(FUNDO_POR_DEFEITO).toBe('exata')
  })
})

describe('o motor real remove o fundo', () => {
  it('torna transparente o fundo e mantem o recorte interior', async () => {
    const r = await motor.convert(comRecorteInterior, comFundo('png', FUNDO_POR_DEFEITO), {
      magickFormat: null,
    })
    const a = alfaDe(r.bytes)

    // O fundo e a maior parte da imagem e tem de desaparecer.
    expect(percentagemTransparente(a)).toBeGreaterThan(50)

    // Os quatro cantos, que foram os pontos de partida.
    expect(alfaEm(a, 0, 0)).toBeLessThan(TRANSPARENTE)
    expect(alfaEm(a, LARGURA - 1, 0)).toBeLessThan(TRANSPARENTE)
    expect(alfaEm(a, 0, ALTURA - 1)).toBeLessThan(TRANSPARENTE)
    expect(alfaEm(a, LARGURA - 1, ALTURA - 1)).toBeLessThan(TRANSPARENTE)

    // O corpo do objeto fica.
    expect(alfaEm(a, 250, 200)).toBeGreaterThan(OPACO)

    /*
     * E o recorte BRANCO dentro do objeto tambem, que e o ponto todo de
     * preencher a partir dos cantos. Um limiar global apagava-o: e da mesma
     * cor do fundo, apenas nao esta ligado a borda.
     */
    expect(alfaEm(a, 165, 112)).toBeGreaterThan(OPACO)
  })

  it('nao apaga um objeto de cor proxima do fundo na tolerancia por defeito', async () => {
    const r = await motor.convert(objetoQuaseBranco, comFundo('png', FUNDO_POR_DEFEITO), {
      magickFormat: null,
    })
    const a = alfaDe(r.bytes)

    // Este e o caso destrutivo: a 8 % de tolerancia a imagem inteira
    // desaparecia. A 2 % o objeto sobrevive.
    expect(alfaEm(a, 200, 150)).toBeGreaterThan(OPACO)
    expect(percentagemTransparente(a)).toBeLessThan(90)
  })

  it('sem a opcao, nada fica transparente', async () => {
    const r = await motor.convert(comRecorteInterior, comFundo('png', null), {
      magickFormat: null,
    })
    expect(percentagemTransparente(alfaDe(r.bytes))).toBeLessThan(1)
  })

  it('a percentagem que sobra e medida e nao inventada', async () => {
    const semRecorte = await motor.convert(comRecorteInterior, comFundo('png', null), {
      magickFormat: null,
    })
    expect(semRecorte.backgroundKeptPercent).toBeNull()

    const comRecorte = await motor.convert(comRecorteInterior, comFundo('png', FUNDO_POR_DEFEITO), {
      magickFormat: null,
    })
    const medido = comRecorte.backgroundKeptPercent
    expect(medido).not.toBeNull()

    // A media do alfa tem de concordar com a contagem exacta de pixeis. Se
    // divergirem, a percentagem mostrada ao utilizador nao descreve a imagem.
    const exacto = 100 - percentagemTransparente(alfaDe(comRecorte.bytes))
    expect(Math.abs(medido! - exacto)).toBeLessThan(3)
  })

  it('num fundo fotografico nao encontra fundo, e diz que nao encontrou', async () => {
    const r = await motor.convert(fundoComplexo, comFundo('png', 'exata'), {
      magickFormat: null,
    })
    // Nao remove nada, o que e o comportamento correto: e melhor nao fazer
    // nada do que entregar um recorte aos pedacos. A interface le esta
    // percentagem e diz ao utilizador que o fundo nao e uniforme.
    expect(r.backgroundKeptPercent).toBeGreaterThan(99)
  })

  it('num JPEG a opcao nao tem efeito nenhum nos bytes', async () => {
    const comOpcao = await motor.convert(comRecorteInterior, comFundo('jpeg', 'normal'), {
      magickFormat: null,
    })
    const semOpcao = await motor.convert(comRecorteInterior, comFundo('jpeg', null), {
      magickFormat: null,
    })
    expect(comOpcao.backgroundKeptPercent).toBeNull()
    expect(comOpcao.bytes.byteLength).toBe(semOpcao.bytes.byteLength)
  })

  it('o resultado continua a ser um PNG legivel', async () => {
    const r = await motor.convert(comRecorteInterior, comFundo('png', FUNDO_POR_DEFEITO), {
      magickFormat: null,
    })
    // Assinatura de PNG, e uma releitura que nao lanca.
    expect([...r.bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
    const relido = MagickImage.create()
    relido.read(r.bytes)
    expect(relido.width).toBe(LARGURA)
    expect(relido.hasAlpha).toBe(true)
    relido.dispose()
  })

  it('uma tolerancia maior remove mais fundo com ruido', async () => {
    // Fundo de estudio: branco com gradiente e ruido, que a tolerancia exacta
    // nao consegue percorrer por inteiro.
    const estudio = png((img) => {
      img.read('gradient:white-rgb(232,236,241)', comDimensoes())
      img.addNoise(1, 0.8)
      img.draw([
        new DrawableFillColor(MagickColors.SteelBlue),
        new DrawableRoundRectangle(110, 70, 290, 230, 24, 24),
      ])
    })

    const exata = await motor.convert(estudio, comFundo('png', 'exata'), { magickFormat: null })
    const normal = await motor.convert(estudio, comFundo('png', 'normal'), { magickFormat: null })

    expect(percentagemTransparente(alfaDe(normal.bytes))).toBeGreaterThan(
      percentagemTransparente(alfaDe(exata.bytes)),
    )
  })
})

describe('o canal alfa e mesmo escrito pelo motor', () => {
  it('a media do alfa cai quando o fundo e removido', async () => {
    const r = await motor.convert(comRecorteInterior, comFundo('png', FUNDO_POR_DEFEITO), {
      magickFormat: null,
    })
    const img = MagickImage.create()
    img.read(r.bytes)
    const alfa = img.statistics(Channels.Alpha).getChannel(PixelChannel.Alpha)
    img.dispose()
    expect(alfa).not.toBeNull()
    // Menos de metade opaco: e o fundo que saiu.
    expect(alfa!.mean / 255).toBeLessThan(0.5)
  })
})
