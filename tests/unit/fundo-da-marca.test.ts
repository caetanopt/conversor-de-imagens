// @vitest-environment node
/**
 * Contraste do texto sobre a imagem de fundo da zona de largar.
 *
 * O teste de contraste normal compara dois tokens. Aqui um dos lados nao e uma
 * cor, e uma imagem com mais de um milhao de pixeis, e o texto por cima tem de
 * cumprir a WCAG 2.2 AA em toda ela. Uma media nao serve: bastava um canto
 * claro para o titulo desaparecer nesse canto.
 *
 * Por isso o teste descodifica o ficheiro gravado com o proprio motor da
 * aplicacao, procura o pixel MAIS CLARO de toda a imagem, e mede cada token
 * --field-* contra esse pixel. Se o pior caso passa, qualquer recorte,
 * qualquer `background-position` e qualquer tamanho de ecra passam.
 *
 * A imagem e gerada por scripts/gerar-fundo-marca.mjs a partir do manual. Se
 * alguem mexer no veu, na fonte ou na compressao, este teste diz logo se o
 * texto deixou de ser legivel.
 */
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

import { initializeImageMagick, ImageMagick, MagickFormat } from '@imagemagick/magick-wasm'

import { contraste, LIMIARES, parseCor, type Rgb, type TipoDeContraste } from '@/lib/color/contraste'
import { lerTemas } from '@/lib/color/tokens'

const FUNDO = resolve(process.cwd(), 'public/marca/fundo-caetano.webp')
const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')
const tokens = lerTemas(css).claro

/**
 * Orcamento de tamanho.
 *
 * O fundo carrega no primeiro paint, antes de o utilizador escolher qualquer
 * ficheiro, e a seccao 19.2 do CLAUDE.md nao quer peso nessa fase. Um campo de
 * cor comprime muito bem; se passar disto, algo mudou na geracao.
 */
const LIMITE_DE_BYTES = 40 * 1024

/** Tokens aplicados sobre o campo, com o limiar que cabe a cada um. */
const SOBRE_O_CAMPO: readonly {
  readonly token: string
  readonly tipo: TipoDeContraste
  readonly onde: string
}[] = [
  { token: '--field-text-strong', tipo: 'texto', onde: 'titulo e valores da faixa' },
  { token: '--field-text-muted', tipo: 'texto', onde: 'subtexto e etiquetas' },
  { token: '--field-text-faint', tipo: 'texto', onde: '"ou arraste para aqui"' },
  // A moldura tracejada da zona e o que identifica o componente: 3:1 (1.4.11).
  { token: '--field-line', tipo: 'componente', onde: 'moldura da zona e linha da faixa' },
  // O botao primario e uma superficie, e a sua fronteira contra o campo
  // tambem tem de se distinguir.
  { token: '--field-accent', tipo: 'componente', onde: 'fundo do botao primario' },
]

let maisClaro: Rgb
let dimensoes: { largura: number; altura: number; pixeis: number }

beforeAll(async () => {
  await initializeImageMagick(
    new Uint8Array(readFileSync(resolve(process.cwd(), 'public/magick/magick.wasm'))),
  )

  const bytes = new Uint8Array(readFileSync(FUNDO))
  ImageMagick.read(bytes, (imagem) => {
    expect(imagem.format).toBe(MagickFormat.WebP)
    // Escreve para RGB cru: tres bytes por pixel, sem alfa e sem surpresas de
    // ordem de canais.
    imagem.write(MagickFormat.Rgb, (cru) => {
      let piorLuminancia = -1
      let pior: Rgb = { r: 0, g: 0, b: 0 }
      for (let i = 0; i + 2 < cru.length; i += 3) {
        const cor: Rgb = { r: cru[i]! / 255, g: cru[i + 1]! / 255, b: cru[i + 2]! / 255 }
        // Contraste com branco desce quando a luminancia sobe, portanto o pior
        // caso para texto claro e o pixel mais luminoso.
        const l = luminanciaSimples(cor)
        if (l > piorLuminancia) {
          piorLuminancia = l
          pior = cor
        }
      }
      maisClaro = pior
      dimensoes = {
        largura: imagem.width,
        altura: imagem.height,
        pixeis: cru.length / 3,
      }
    })
  })
}, 120_000)

/** Luminancia relativa, so para ordenar pixeis. */
function luminanciaSimples({ r, g, b }: Rgb): number {
  const c = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b)
}

function hex({ r, g, b }: Rgb): string {
  const d = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${d(r)}${d(g)}${d(b)}`
}

describe('a imagem de fundo da marca', () => {
  it('existe e cabe no orcamento de bytes', () => {
    const bytes = statSync(FUNDO).size
    expect(bytes).toBeGreaterThan(0)
    expect(
      bytes,
      `${bytes} bytes, limite ${LIMITE_DE_BYTES}. Regenerar com node scripts/gerar-fundo-marca.mjs`,
    ).toBeLessThanOrEqual(LIMITE_DE_BYTES)
  })

  it('tem a dimensao que o script gera', () => {
    expect(dimensoes.largura).toBe(1600)
    expect(dimensoes.altura).toBe(780)
    expect(dimensoes.pixeis).toBe(1600 * 780)
  })

  it('nao tem nenhuma zona quase branca', () => {
    // O ficheiro original do manual tem o brilho cyan a chegar quase ao branco,
    // e o veu do script existe para o baixar. Sem veu, o pixel mais claro dava
    // 1,01:1 com texto branco, ou seja, invisivel.
    const comBranco = contraste({ r: 1, g: 1, b: 1 }, maisClaro)
    expect(
      comBranco,
      `pixel mais claro ${hex(maisClaro)} da ${comBranco.toFixed(2)}:1 com branco`,
    ).toBeGreaterThan(4.5)
  })
})

describe('contraste sobre o campo, medido no pixel mais claro', () => {
  for (const { token, tipo, onde } of SOBRE_O_CAMPO) {
    it(`${onde}: ${token}`, () => {
      const valor = tokens[token]
      expect(valor, `token ${token} nao existe em tokens.css`).toBeDefined()

      const cor = parseCor(valor!)
      expect(cor, `${token} = "${valor}" nao e uma cor`).not.toBeNull()

      const razao = contraste(cor!, maisClaro)
      const limiar = LIMIARES[tipo]
      expect(
        razao,
        `${token} sobre o pixel mais claro do fundo (${hex(maisClaro)}): ` +
          `${razao.toFixed(2)}:1, precisa de ${limiar}:1 (${tipo})`,
      ).toBeGreaterThanOrEqual(limiar)
    })
  }

  it('o texto do botao primario le-se sobre o proprio botao', () => {
    // O botao e branco sobre o campo, e leva o azul da marca por cima. Sem esta
    // inversao, um botao azul profundo sobre um campo azul profundo desaparecia.
    const fundo = parseCor(tokens['--field-accent']!)
    const texto = parseCor(tokens['--field-on-accent']!)
    expect(fundo).not.toBeNull()
    expect(texto).not.toBeNull()
    expect(contraste(texto!, fundo!)).toBeGreaterThanOrEqual(LIMIARES.texto)
  })

  it('o botao em hover continua a ler-se', () => {
    const fundo = parseCor(tokens['--field-accent-hover']!)
    const texto = parseCor(tokens['--field-on-accent']!)
    expect(fundo).not.toBeNull()
    expect(texto).not.toBeNull()
    expect(contraste(texto!, fundo!)).toBeGreaterThanOrEqual(LIMIARES.texto)
  })

  it('os tokens do campo nao mudam com o tema', () => {
    // O campo e uma imagem: e igual nos dois temas, portanto o texto por cima
    // tambem tem de ser. Se alguem redefinir um destes num bloco de tema, o
    // tema escuro passava a ter texto medido contra o fundo errado.
    const temas = lerTemas(css)
    for (const { token } of SOBRE_O_CAMPO) {
      expect(temas.escuroPorEscolha[token], `${token} mudou no tema escuro`).toBe(
        temas.claro[token],
      )
    }
  })
})
