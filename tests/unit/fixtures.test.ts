// @vitest-environment node
/**
 * Comportamento do motor contra os casos de imagem reais.
 *
 * Corre o binario WASM verdadeiro sobre as fixtures de tests/fixtures, que sao
 * ficheiros construidos byte a byte para exercitar um caminho concreto cada um.
 * Sem estes ficheiros, os testes de metadados e de robustez seriam vazios.
 *
 * Gerar as fixtures: npm run fixtures
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  ImageMagick,
  initializeImageMagick,
  MagickFormat,
  type IMagickImage,
} from '@imagemagick/magick-wasm'

import { detetarFormatoPorAssinatura } from '@/lib/files/signature'
import { resolveMetadataDirective } from '@/lib/image-engine/options'
import { classificarErroDoMotor } from '@/lib/image-engine/protocol'

const FIXTURES = resolve(process.cwd(), 'tests/fixtures')

function ler(nome: string): Uint8Array {
  const caminho = resolve(FIXTURES, nome)
  if (!existsSync(caminho)) {
    throw new Error(`Fixture ${nome} nao existe. Corra: npm run fixtures`)
  }
  return new Uint8Array(readFileSync(caminho))
}

beforeAll(async () => {
  await initializeImageMagick(
    new Uint8Array(readFileSync(resolve(process.cwd(), 'public/magick/magick.wasm'))),
  )
}, 60_000)

// -------------------------------------------------------- deteccao de formato

describe('o formato vem dos bytes, nao da extensao', () => {
  const casos: readonly [string, string | null][] = [
    ['jpeg-normal.jpg', 'jpeg'],
    ['jpeg-progressivo.jpg', 'jpeg'],
    ['png-rgb.png', 'png'],
    ['png-transparencia.png', 'png'],
    ['webp-normal.webp', 'webp'],
    // Um PNG com extensao .jpg tem de ser detetado como PNG.
    ['extensao-errada.jpg', 'png'],
    // Sem extensao nenhuma, a assinatura resolve.
    ['sem-extensao', 'jpeg'],
    // Um ZIP disfarcado nao e nenhum formato nosso.
    ['nao-e-imagem.jpg', null],
  ]

  for (const [nome, esperado] of casos) {
    it(`${nome} e detetado como ${esperado ?? 'desconhecido'}`, () => {
      expect(detetarFormatoPorAssinatura(ler(nome).subarray(0, 32))).toBe(esperado)
    })
  }

  it('um nome com acentos e caracteres nao latinos nao afeta a deteccao', () => {
    const nome = 'fotografia-ferias-2026-acentuacao-ção-日本語.jpg'
    expect(detetarFormatoPorAssinatura(ler(nome).subarray(0, 32))).toBe('jpeg')
  })
})

// -------------------------------------------------------------------- decode

describe('o motor le os casos validos', () => {
  const casos: readonly [string, string, number, number][] = [
    ['jpeg-normal.jpg', 'JPEG', 1200, 800],
    ['jpeg-progressivo.jpg', 'JPEG', 1200, 800],
    ['jpeg-exif-orientacao-6.jpg', 'JPEG', 400, 300],
    ['jpeg-icc-adobergb.jpg', 'JPEG', 400, 300],
    ['jpeg-cmyk.jpg', 'JPEG', 400, 300],
    ['png-rgb.png', 'PNG', 1200, 800],
    ['png-transparencia.png', 'PNG', 400, 300],
    ['png-grande.png', 'PNG', 3000, 2000],
    ['webp-normal.webp', 'WEBP', 1200, 800],
  ]

  for (const [nome, formato, largura, altura] of casos) {
    it(`${nome} le como ${formato} ${largura}x${altura}`, () => {
      const info = ImageMagick.read(ler(nome), (img) => ({
        formato: String(img.format),
        largura: img.width,
        altura: img.height,
      }))
      expect(info).toEqual({ formato, largura, altura })
    })
  }

  it('o JPEG CMYK tem 4 componentes e nao 3', () => {
    // Os browsers nao descodificam CMYK de forma fiavel, por isso o motor tem
    // de o fazer. Se esta fixture deixasse de ser CMYK, o teste perdia sentido.
    const bytes = ler('jpeg-cmyk.jpg')
    expect(componentesSof(bytes)).toBe(4)
    expect(componentesSof(ler('jpeg-normal.jpg'))).toBe(3)
  })

  it('o JPEG progressivo tem o marcador SOF2', () => {
    expect(marcadorSof(ler('jpeg-progressivo.jpg'))).toBe(0xc2)
    expect(marcadorSof(ler('jpeg-normal.jpg'))).toBe(0xc0)
  })

  it('a transparencia do PNG e reconhecida', () => {
    const alfa = ImageMagick.read(ler('png-transparencia.png'), (img) => img.hasAlpha)
    expect(alfa).toBe(true)
  })
})

// ------------------------------------------------------------ casos degenerados

describe('os casos degenerados falham de forma tratada', () => {
  const casos: readonly [string, string][] = [
    ['nao-e-imagem.jpg', 'formato-nao-suportado'],
    ['corrompido.jpg', 'ficheiro-invalido'],
    ['minusculo.jpg', 'ficheiro-invalido'],
    ['vazio.jpg', 'ficheiro-invalido'],
  ]

  for (const [nome, kindEsperado] of casos) {
    it(`${nome} da o estado ${kindEsperado}`, () => {
      let capturado: unknown = null
      try {
        ImageMagick.read(ler(nome), (img) => img.width)
      } catch (erro) {
        capturado = erro
      }

      expect(capturado, `${nome} deveria ter falhado`).not.toBeNull()
      const bruto = capturado instanceof Error ? capturado.message : String(capturado)
      const classificado = classificarErroDoMotor(bruto)

      expect(classificado.kind).toBe(kindEsperado)
      // O utilizador nunca ve o texto do motor.
      expect(classificado.message).not.toContain('error/')
      expect(classificado.message).not.toMatch(/0x[0-9a-f]+/i)
    })
  }

  it('um ficheiro truncado nao lanca, produz uma imagem parcial', () => {
    // Comportamento verificado do ImageMagick: tolera truncagem e descodifica o
    // que consegue. Nao e um erro, mas tambem nao e obvio, por isso fica
    // registado aqui em vez de ser descoberto em producao.
    const info = ImageMagick.read(ler('truncado.jpg'), (img) => ({
      largura: img.width,
      altura: img.height,
    }))
    expect(info).toEqual({ largura: 400, altura: 300 })
  })
})

// -------------------------------------------------------- metadados e perfis

describe('politica de metadados', () => {
  /** Aplica uma politica e devolve os bytes e os perfis que sobreviveram. */
  function aplicar(nome: string, politica: 'remover' | 'preservar-cor' | 'manter') {
    const diretiva = resolveMetadataDirective(politica)
    const saida = ImageMagick.read(ler(nome), (img: IMagickImage) => {
      img.autoOrient()
      if (diretiva.strip) {
        // Copia obrigatoria: o objeto do perfil nao sobrevive ao strip.
        const perfil = diretiva.preserveColorProfile ? img.getProfile('icc') : null
        const icc = perfil ? new Uint8Array(perfil.data) : null
        img.strip()
        if (icc) img.setProfile('icc', icc)
      }
      return img.write(MagickFormat.Jpeg, (d) => new Uint8Array(d))
    })
    const perfis = ImageMagick.read(saida, (img) => [...img.profileNames])
    return { bytes: Buffer.from(saida), perfis }
  }

  /** Cada uma destas cadeias e um dado privado que esta na fixture. */
  const DADOS_PRIVADOS = [
    'Fabricante de Teste',
    'Modelo XY-1000',
    'SN-0123456789',
    '2026:01:15',
    'Autor de Teste',
    'Autor IPTC',
    'Lisboa',
  ] as const

  it('a fixture de referencia contem de facto os dados privados', () => {
    // Sem esta verificacao, os testes abaixo passariam sobre um ficheiro vazio.
    const original = Buffer.from(ler('jpeg-tudo-metadados.jpg'))
    for (const dado of DADOS_PRIVADOS) {
      expect(original.includes(Buffer.from(dado, 'latin1')), dado).toBe(true)
    }
  })

  it("'preservar-cor' apaga todos os dados privados dos bytes de saida", () => {
    const { bytes } = aplicar('jpeg-tudo-metadados.jpg', 'preservar-cor')
    for (const dado of DADOS_PRIVADOS) {
      expect(bytes.includes(Buffer.from(dado, 'latin1')), `${dado} sobreviveu`).toBe(false)
    }
  })

  it("'preservar-cor' apaga EXIF, XMP e IPTC mas mantem o perfil de cor", () => {
    const { perfis } = aplicar('jpeg-icc-e-exif.jpg', 'preservar-cor')
    expect(perfis).toEqual(['icc'])
  })

  it("'remover' apaga tambem o perfil de cor", () => {
    const { perfis } = aplicar('jpeg-icc-e-exif.jpg', 'remover')
    expect(perfis).toEqual([])
  })

  it("'manter' mantem tudo", () => {
    const { perfis } = aplicar('jpeg-icc-e-exif.jpg', 'manter')
    expect(perfis).toContain('icc')
    expect(perfis).toContain('exif')
  })

  it('preservar o perfil custa poucos bytes', () => {
    const comCor = aplicar('jpeg-icc-e-exif.jpg', 'preservar-cor')
    const semCor = aplicar('jpeg-icc-e-exif.jpg', 'remover')
    const custo = comCor.bytes.length - semCor.bytes.length
    // Medido: 570 bytes para um perfil de 552. Um perfil real de Display P3
    // ronda os 500, e um de AdobeRGB completo cerca de 3 KB.
    expect(custo).toBeGreaterThan(0)
    expect(custo).toBeLessThan(4096)
  })

  it('a orientacao EXIF e aplicada aos pixels antes de o EXIF ser apagado', () => {
    // Orientacao 6 significa rodar 90 graus. Uma imagem 400x300 fica 300x400.
    // Se o strip acontecesse primeiro, a rotacao perdia-se e a imagem saia
    // deitada. Esta e a razao da ordem imposta no adapter.
    const dimensoes = ImageMagick.read(ler('jpeg-exif-orientacao-6.jpg'), (img) => {
      img.autoOrient()
      img.strip()
      return { largura: img.width, altura: img.height }
    })
    expect(dimensoes).toEqual({ largura: 300, altura: 400 })
  })

  it('sem auto orient a imagem sairia com as dimensoes trocadas', () => {
    // Contraprova do teste anterior.
    const dimensoes = ImageMagick.read(ler('jpeg-exif-orientacao-6.jpg'), (img) => ({
      largura: img.width,
      altura: img.height,
    }))
    expect(dimensoes).toEqual({ largura: 400, altura: 300 })
  })
})

// ------------------------------------------------ otimizacao no mesmo formato

describe('otimizacao no mesmo formato', () => {
  const casos: readonly [string, MagickFormat][] = [
    ['jpeg-normal.jpg', MagickFormat.Jpeg],
    ['png-rgb.png', MagickFormat.Png],
    ['webp-normal.webp', MagickFormat.WebP],
  ]

  for (const [nome, formato] of casos) {
    it(`${nome} volta a sair como ${formato} e continua legivel`, () => {
      const entrada = ler(nome)
      const saida = ImageMagick.read(entrada, (img) => {
        img.strip()
        if (formato !== MagickFormat.Png) img.quality = 82
        return img.write(formato, (d) => new Uint8Array(d))
      })

      expect(saida.length).toBeGreaterThan(0)
      const info = ImageMagick.read(saida, (img) => ({
        formato: String(img.format),
        largura: img.width,
        altura: img.height,
      }))
      expect(info.formato).toBe(String(formato))
      // As dimensoes nao mudam: otimizar nao e redimensionar.
      const original = ImageMagick.read(entrada, (img) => ({ w: img.width, h: img.height }))
      expect(info.largura).toBe(original.w)
      expect(info.altura).toBe(original.h)
    })
  }

  it('a transparencia sobrevive a otimizacao PNG para PNG', () => {
    const saida = ImageMagick.read(ler('png-transparencia.png'), (img) => {
      img.strip()
      return img.write(MagickFormat.Png, (d) => new Uint8Array(d))
    })
    expect(ImageMagick.read(saida, (img) => img.hasAlpha)).toBe(true)
  })

  it('a transparencia desaparece ao converter PNG para JPEG', () => {
    // JPEG nao tem canal alfa. Nao e um bug, e uma perda inerente ao formato,
    // e o registry declara supportsAlpha: false para JPEG por esta razao.
    const saida = ImageMagick.read(ler('png-transparencia.png'), (img) =>
      img.write(MagickFormat.Jpeg, (d) => new Uint8Array(d)),
    )
    expect(ImageMagick.read(saida, (img) => img.hasAlpha)).toBe(false)
  })
})

// -------------------------------------------------------------------- auxiliares

/** Numero de componentes declarado no SOF. 3 e YCbCr, 4 e CMYK ou YCCK. */
function componentesSof(b: Uint8Array): number | null {
  const pos = posicaoSof(b)
  return pos === null ? null : (b[pos + 9] ?? null)
}

/** Tipo do marcador SOF: 0xC0 baseline, 0xC2 progressivo. */
function marcadorSof(b: Uint8Array): number | null {
  const pos = posicaoSof(b)
  return pos === null ? null : (b[pos + 1] ?? null)
}

function posicaoSof(b: Uint8Array): number | null {
  for (let i = 2; i < b.length - 1; ) {
    if (b[i] !== 0xff) {
      i += 1
      continue
    }
    const marcador = b[i + 1]!
    if (marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador)) return i
    if (marcador === 0xda) return null
    i += 2 + ((b[i + 2]! << 8) | b[i + 3]!)
  }
  return null
}
