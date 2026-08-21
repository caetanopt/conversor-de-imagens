// @vitest-environment node
/**
 * Qualidade visual medida, e nao apenas tamanho.
 *
 * Existe porque comparar formatos pelo numero de qualidade e enganador. Medido:
 * AVIF a qualidade 55 produzia um ficheiro MAIOR que WebP a 80, o que sugeria
 * que o AVIF era pior. A conclusao invertia-se ao comparar a distorcao igual.
 *
 * A metrica e o SSIM do proprio ImageMagick, portanto nao ha dependencia nova.
 *
 * ATENCAO a semantica: neste motor, `ErrorMetric.StructuralSimilarity` devolve
 * 0 para imagens identicas e cresce com a degradacao, ou seja comporta-se como
 * dissimilaridade, ao contrario do que o nome sugere. Verificado comparando uma
 * imagem consigo mesma. Aqui chamamos-lhe distorcao para nao induzir em erro.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import {
  ErrorMetric,
  ImageMagick,
  initializeImageMagick,
  Magick,
  MagickFormat,
  MagickImage,
  MagickReadSettings,
} from '@imagemagick/magick-wasm'

import { formatoPorId, type FormatId } from '@/config/formats'
import { PRESETS, qualidadeDoPreset } from '@/config/presets'
import { opcoesPorDefeito } from '@/features/converter/state/jobsReducer'
import { resolveEncodeDirectives } from '@/lib/image-engine/options'

// Cada medicao faz um encode e duas descodificacoes para o SSIM. Sao dezenas de
// operacoes, portanto o limite por defeito de 5 s nao chega.
vi.setConfig({ testTimeout: 60_000 })

let fonte: Uint8Array

beforeAll(async () => {
  await initializeImageMagick(
    new Uint8Array(readFileSync(resolve(process.cwd(), 'public/magick/magick.wasm'))),
  )

  // Semente fixa: `plasma` nao e deterministico sem ela, e este ficheiro
  // compara tamanhos com margens de poucos por cento. Sem semente, o teste
  // passava isolado e falhava na suite, com uma imagem diferente de cada vez.
  Magick.setRandomSeed(20260101)

  // Conteudo com gradiente e estrutura, mais parecido com uma fotografia do que
  // ruido puro. Ruido puro nao comprime e faria as duas familias parecerem
  // igualmente maas.
  // 640x480 chega para a comparacao e mantem o ficheiro de testes rapido.
  const settings = new MagickReadSettings()
  settings.width = 640
  settings.height = 480
  const seed = MagickImage.create()
  seed.read('plasma:rgb(200,150,100)-rgb(40,70,120)', settings)
  fonte = seed.write(MagickFormat.Png, (d) => new Uint8Array(d))
  seed.dispose()
}, 60_000)

type Medicao = { bytes: number; distorcao: number }

/** Codifica com as diretivas reais da aplicacao e mede a distorcao. */
function medir(formato: FormatId, qualidade: number): Medicao {
  const diretivas = resolveEncodeDirectives({
    ...opcoesPorDefeito(formato),
    quality: qualidade,
    preset: null,
  })

  const saida = ImageMagick.read(fonte, (img) => {
    if (diretivas.quality !== null) img.quality = diretivas.quality
    for (const d of diretivas.defines) {
      img.settings.setDefine(d.format as MagickFormat, d.name, d.value)
    }
    return img.write(diretivas.magickFormat as MagickFormat, (b) => new Uint8Array(b))
  })

  const distorcao = ImageMagick.read(fonte, (original) =>
    ImageMagick.read(saida, (resultado) =>
      original.compare(resultado, ErrorMetric.StructuralSimilarity),
    ),
  )

  return { bytes: saida.length, distorcao }
}

describe('semantica da metrica', () => {
  it('uma imagem comparada consigo mesma da distorcao zero', () => {
    const zero = ImageMagick.read(fonte, (a) =>
      ImageMagick.read(fonte, (b) => a.compare(b, ErrorMetric.StructuralSimilarity)),
    )
    expect(zero).toBe(0)
  })

  it('mais qualidade da menos distorcao', () => {
    // Se esta relacao nao se verificasse, a metrica nao serviria para nada.
    const baixa = medir('jpeg', 30)
    const alta = medir('jpeg', 95)
    expect(alta.distorcao).toBeLessThan(baixa.distorcao)
    expect(alta.bytes).toBeGreaterThan(baixa.bytes)
  })
})

describe('a qualidade cresce de forma monotona em cada formato', () => {
  for (const formato of ['jpeg', 'webp', 'avif'] as const) {
    it(`${formatoPorId(formato).label}: menos distorcao a qualidade mais alta`, () => {
      const medicoes = [40, 60, 80, 95].map((q) => ({ q, ...medir(formato, q) }))

      for (let i = 1; i < medicoes.length; i += 1) {
        const anterior = medicoes[i - 1]!
        const atual = medicoes[i]!
        expect(
          atual.distorcao,
          `${formato} q${atual.q} devia ter menos distorcao que q${anterior.q}`,
        ).toBeLessThanOrEqual(anterior.distorcao)
      }
    })
  }
})

describe('AVIF contra WebP a distorcao equivalente', () => {
  it('a mesma qualidade numerica, o AVIF tem menos distorcao', () => {
    // Esta e a razao pela qual comparar pelo numero de qualidade engana: o
    // AVIF gasta mais bytes porque entrega mais qualidade no mesmo numero.
    for (const q of [50, 70, 85]) {
      const avif = medir('avif', q)
      const webp = medir('webp', q)
      expect(avif.distorcao, `q${q}`).toBeLessThan(webp.distorcao)
    }
  })

  it('a distorcao equivalente, o AVIF gasta menos bytes que o WebP', () => {
    // O ponto que justifica ativar o AVIF. Comparamos WebP 80, o valor do
    // preset Equilibrado, com o AVIF calibrado para a mesma distorcao.
    const webp80 = medir('webp', qualidadeDoPreset('equilibrado', formatoPorId('webp'))!)
    const avifEquivalente = medir('avif', qualidadeDoPreset('equilibrado', formatoPorId('avif'))!)

    expect(
      avifEquivalente.distorcao,
      'o AVIF do preset devia ter distorcao comparavel ou melhor que WebP 80',
    ).toBeLessThanOrEqual(webp80.distorcao)

    // A margem medida e de poucos por cento neste conteudo sintetico, por isso
    // a asserção e "nao gasta mais bytes" com uma folga de 5 %, e nao "gasta
    // menos". Uma asserção a 2 % de margem quebraria a cada atualizacao do
    // motor sem indicar nada de util.
    expect(
      avifEquivalente.bytes,
      `AVIF ${avifEquivalente.bytes} B vs WebP ${webp80.bytes} B a distorcao equivalente`,
    ).toBeLessThanOrEqual(Math.round(webp80.bytes * 1.05))
  })
})

describe('coerencia dos presets entre formatos', () => {
  for (const preset of PRESETS) {
    it(`o preset ${preset.label} da qualidade visual comparavel em JPG, WebP e AVIF`, () => {
      const medicoes = (['jpeg', 'webp', 'avif'] as const).map((formato) => {
        const qualidade = qualidadeDoPreset(preset.id, formatoPorId(formato))
        expect(qualidade, `${formato} sem qualidade no preset ${preset.id}`).not.toBeNull()
        return { formato, qualidade: qualidade!, ...medir(formato, qualidade!) }
      })

      const distorcoes = medicoes.map((m) => m.distorcao)
      const menor = Math.min(...distorcoes)
      const maior = Math.max(...distorcoes)

      // Um preset chamado "Equilibrado" tem de significar o mesmo em qualquer
      // formato. Com a calibracao atual o desvio medido fica entre 1,04 e 1,31,
      // portanto 1,5 e apertado o suficiente para apanhar uma descalibracao
      // real e largo o suficiente para nao ser fragil.
      expect(
        maior / menor,
        `distorcoes: ${medicoes.map((m) => `${m.formato} q${m.qualidade}=${m.distorcao.toFixed(4)}`).join(', ')}`,
      ).toBeLessThan(1.5)
    })
  }

  it('a qualidade desce de alta para equilibrado para menor, em todos os formatos', () => {
    for (const formato of ['jpeg', 'webp', 'avif'] as const) {
      const capacidade = formatoPorId(formato)
      const alta = qualidadeDoPreset('alta', capacidade)!
      const equilibrado = qualidadeDoPreset('equilibrado', capacidade)!
      const menor = qualidadeDoPreset('menor', capacidade)!
      expect(alta, formato).toBeGreaterThan(equilibrado)
      expect(equilibrado, formato).toBeGreaterThan(menor)
    }
  })

  it('nenhum preset usa a qualidade 100 em WebP', () => {
    // A 100 o WebP muda para modo sem perda e o ficheiro fica muito maior.
    // Um preset nunca deve accionar essa mudanca sem o utilizador pedir.
    for (const preset of PRESETS) {
      expect(qualidadeDoPreset(preset.id, formatoPorId('webp'))).toBeLessThan(100)
    }
  })
})
