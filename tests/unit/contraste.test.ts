// @vitest-environment node
/**
 * Contraste dos tokens de cor.
 *
 * A seccao 20.8 do CLAUDE.md exige contraste suficiente, e a 20.4 proibe
 * depender apenas da cor. Nada disso se verifica a olho, por isso esta aqui.
 *
 * Os tokens sao provisorios, e este teste continua a valer quando o manual da
 * marca chegar: um par de cores com pouca diferenca de luminosidade e um
 * problema estrutural, e a marca nova herda-o se ninguem medir. Quando os
 * valores forem substituidos, este teste diz logo o que deixou de passar.
 *
 * Limiares da WCAG 2.2 AA: 4.5:1 para texto normal, 3:1 para texto grande e
 * para limites de controlos.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  contraste,
  contrasteEntreTokens,
  LIMIARES,
  luminancia,
  oklchParaRgb,
  parseOklch,
  type TipoDeContraste,
} from '@/lib/color/contraste'
import { lerTemas, type TemaDeCores } from '@/lib/color/tokens'

const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')
const temas = lerTemas(css)

/**
 * Pares que o produto realmente mostra, com o limiar que lhes cabe.
 *
 * A lista e escrita a mao de proposito: um teste que combinasse todas as cores
 * com todas as superficies falharia em pares que nunca aparecem juntos e
 * ensinaria a ignorar o resultado.
 */
const PARES: readonly {
  readonly frente: string
  readonly fundo: string
  readonly tipo: TipoDeContraste
  readonly onde: string
}[] = [
  // Texto principal, em cada superficie onde e usado.
  { frente: '--text-strong', fundo: '--surface-page', tipo: 'texto', onde: 'titulos na pagina' },
  { frente: '--text-strong', fundo: '--surface-raised', tipo: 'texto', onde: 'titulos em cartao' },
  { frente: '--text-strong', fundo: '--surface-inset', tipo: 'texto', onde: 'linha selecionada' },
  { frente: '--text-default', fundo: '--surface-page', tipo: 'texto', onde: 'corpo na pagina' },
  { frente: '--text-default', fundo: '--surface-raised', tipo: 'texto', onde: 'corpo em cartao' },
  { frente: '--text-muted', fundo: '--surface-page', tipo: 'texto', onde: 'texto secundario' },
  { frente: '--text-muted', fundo: '--surface-raised', tipo: 'texto', onde: 'notas em cartao' },
  { frente: '--text-muted', fundo: '--surface-inset', tipo: 'texto', onde: 'opcao nao escolhida' },

  // Texto de apoio, pequeno mas ainda texto: o limiar nao baixa por ser discreto.
  { frente: '--text-faint', fundo: '--surface-page', tipo: 'texto', onde: 'dimensoes da imagem' },
  { frente: '--text-faint', fundo: '--surface-raised', tipo: 'texto', onde: 'nota do painel' },

  // Acento e o seu texto.
  { frente: '--text-on-accent', fundo: '--accent', tipo: 'texto', onde: 'botao primario' },

  // Estados, sobre a superficie e sobre o seu proprio fundo discreto.
  { frente: '--state-positive', fundo: '--surface-raised', tipo: 'texto', onde: 'estado concluido' },
  { frente: '--state-positive', fundo: '--state-positive-quiet', tipo: 'texto', onde: 'resumo do resultado' },
  { frente: '--state-danger', fundo: '--surface-raised', tipo: 'texto', onde: 'estado de erro' },
  { frente: '--state-danger', fundo: '--state-danger-quiet', tipo: 'texto', onde: 'mensagem de erro' },
  { frente: '--state-caution', fundo: '--surface-raised', tipo: 'texto', onde: 'estado de aviso' },
  { frente: '--state-caution', fundo: '--state-caution-quiet', tipo: 'texto', onde: 'aviso de fotogramas' },
  { frente: '--state-busy', fundo: '--surface-raised', tipo: 'texto', onde: 'estado a processar' },

  /*
   * Limites de controlos e o anel de foco: 3:1 pelo criterio 1.4.11.
   *
   * Apenas `--line-control` esta aqui, e nao `--line-strong` nem
   * `--line-default`. O criterio pede 3:1 para o que e NECESSARIO identificar
   * um componente, e esses dois separam regioes: um cartao seleccionado
   * identifica-se pelo fundo e pela barra em `--text-strong`, nao pela moldura.
   * Um campo numerico ou um botao secundario, ao contrario, sao reconhecidos
   * pela moldura, e e essa que tem de cumprir.
   */
  { frente: '--line-control', fundo: '--surface-page', tipo: 'componente', onde: 'moldura da zona de largar' },
  { frente: '--line-control', fundo: '--surface-raised', tipo: 'componente', onde: 'moldura de campo e de botao secundario' },
  { frente: '--focus-ring', fundo: '--surface-page', tipo: 'componente', onde: 'anel de foco na pagina' },
  { frente: '--focus-ring', fundo: '--surface-raised', tipo: 'componente', onde: 'anel de foco em cartao' },
]

function medir(tema: TemaDeCores, frente: string, fundo: string): number {
  const a = tema[frente]
  const b = tema[fundo]
  expect(a, `token ${frente} nao existe`).toBeDefined()
  expect(b, `token ${fundo} nao existe`).toBeDefined()
  const razao = contrasteEntreTokens(a!, b!)
  expect(razao, `${frente} ou ${fundo} nao e uma cor oklch`).not.toBeNull()
  return razao!
}

describe('matematica de cor', () => {
  it('converte os extremos corretamente', () => {
    const preto = oklchParaRgb({ l: 0, c: 0, h: 0 })
    const branco = oklchParaRgb({ l: 1, c: 0, h: 0 })
    expect(preto).toEqual({ r: 0, g: 0, b: 0 })
    expect(branco.r).toBeCloseTo(1, 3)
    expect(branco.g).toBeCloseTo(1, 3)
    expect(branco.b).toBeCloseTo(1, 3)
  })

  it('preto sobre branco da o contraste maximo de 21:1', () => {
    const razao = contraste({ r: 0, g: 0, b: 0 }, { r: 1, g: 1, b: 1 })
    expect(razao).toBeCloseTo(21, 1)
  })

  it('uma cor contra si mesma da 1:1', () => {
    const cor = oklchParaRgb({ l: 0.5, c: 0.1, h: 200 })
    expect(contraste(cor, cor)).toBeCloseTo(1, 6)
  })

  it('a luminancia cresce com a luminosidade', () => {
    const escura = luminancia(oklchParaRgb({ l: 0.2, c: 0, h: 0 }))
    const media = luminancia(oklchParaRgb({ l: 0.5, c: 0, h: 0 }))
    const clara = luminancia(oklchParaRgb({ l: 0.9, c: 0, h: 0 }))
    expect(escura).toBeLessThan(media)
    expect(media).toBeLessThan(clara)
  })

  it('reconhece um cinzento medio conhecido', () => {
    // oklch(59.987% 0 0) e o cinzento sRGB 50 % (128,128,128) na especificacao.
    const rgb = oklchParaRgb({ l: 0.59987, c: 0, h: 0 })
    expect(Math.round(rgb.r * 255)).toBe(128)
  })

  it('recusa valores que nao sao oklch', () => {
    expect(parseOklch('#ffffff')).toBeNull()
    expect(parseOklch('4px')).toBeNull()
    expect(parseOklch('oklch(50% 0.1 200)')).not.toBeNull()
    // Com alfa tambem tem de ser lido: as sombras usam essa forma.
    expect(parseOklch('oklch(0% 0 0 / 0.4)')).not.toBeNull()
  })
})

describe('leitura dos tokens', () => {
  it('encontra os dois temas', () => {
    expect(Object.keys(temas.claro).length).toBeGreaterThan(20)
    expect(Object.keys(temas.escuro).length).toBeGreaterThan(20)
  })

  it('o tema escuro herda o claro e redefine as cores', () => {
    // Os raios nao mudam no escuro, portanto vem do claro.
    expect(temas.escuro['--radius-sm']).toBe(temas.claro['--radius-sm'])
    // A superficie muda.
    expect(temas.escuro['--surface-page']).not.toBe(temas.claro['--surface-page'])
  })
})

for (const [nome, tema] of [
  ['tema claro', temas.claro],
  ['tema escuro', temas.escuro],
] as const) {
  describe(`contraste, ${nome}`, () => {
    for (const par of PARES) {
      it(`${par.onde}: ${par.frente} sobre ${par.fundo}`, () => {
        const razao = medir(tema, par.frente, par.fundo)
        const limiar = LIMIARES[par.tipo]
        expect(
          razao,
          `${razao.toFixed(2)}:1, precisa de ${limiar}:1 (${par.tipo})`,
        ).toBeGreaterThanOrEqual(limiar)
      })
    }
  })
}
