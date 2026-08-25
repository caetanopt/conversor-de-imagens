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
  parseCor,
  parseHex,
  parseOklch,
  type TipoDeContraste,
} from '@/lib/color/contraste'
import { lerBloco, lerTemas, type TemaDeCores } from '@/lib/color/tokens'

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
  { frente: '--line-control', fundo: '--surface-page', tipo: 'componente', onde: 'moldura de botao secundario, interruptor e slider' },
  { frente: '--line-control', fundo: '--surface-raised', tipo: 'componente', onde: 'moldura de campo e de botao secundario' },
  { frente: '--focus-ring', fundo: '--surface-page', tipo: 'componente', onde: 'anel de foco na pagina' },
  { frente: '--focus-ring', fundo: '--surface-raised', tipo: 'componente', onde: 'anel de foco em cartao' },

  /*
   * O painel da zona de largar, sobre a fotografia da marca.
   *
   * --field-painel e uma cor fixa e conhecida, e nao um pixel de imagem, por
   * isso estes pares vivem aqui como qualquer outra superficie da aplicacao.
   * Ver o comentario junto destes tokens em tokens.css.
   */
  { frente: '--field-text-strong', fundo: '--field-painel', tipo: 'texto', onde: 'titulo sobre o painel da zona de largar' },
  { frente: '--field-text-muted', fundo: '--field-painel', tipo: 'texto', onde: 'subtexto sobre o painel' },
  { frente: '--field-text-faint', fundo: '--field-painel', tipo: 'texto', onde: '"ou arraste para aqui" sobre o painel' },
  { frente: '--field-on-accent', fundo: '--field-accent', tipo: 'texto', onde: 'botao sobre o painel' },
  { frente: '--field-on-accent', fundo: '--field-accent-hover', tipo: 'texto', onde: 'botao sobre o painel, em hover' },
  { frente: '--field-line', fundo: '--field-painel', tipo: 'componente', onde: 'linha da faixa, dentro do painel' },
  /*
   * A moldura exterior da zona de largar (--field-line ou, a arrastar,
   * --field-text-strong) NAO esta nesta lista de proposito: essa moldura
   * assenta diretamente na fotografia, cujo pixel por baixo de cada ponto do
   * tracado varia com o recorte. Garantir 3:1 contra qualquer pixel exigiria
   * o mesmo veu pesado que a decisao do painel evitou. Aceita-se um risco
   * residual ali, coberto por tres sinais redundantes que nao dependem da
   * fotografia: o painel solido, o botao "Selecionar ficheiros" e o proprio
   * enquadramento da pagina. Ver DropZone.module.css.
   */
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

  it('le hexadecimal, que e a notacao da paleta da marca', () => {
    expect(parseHex('#ffffff')).toEqual({ r: 1, g: 1, b: 1 })
    expect(parseHex('#000000')).toEqual({ r: 0, g: 0, b: 0 })
    // A forma curta tem de dar o mesmo que a longa.
    expect(parseHex('#fff')).toEqual(parseHex('#ffffff'))
    expect(parseHex('oklch(50% 0.1 200)')).toBeNull()
    expect(parseHex('#12345')).toBeNull()
  })

  it('o azul profundo do manual da o contraste que o manual permite supor', () => {
    // #002e5d com branco por cima: e a combinacao do logotipo.
    const razao = contrasteEntreTokens('#002e5d', '#ffffff')
    expect(razao).not.toBeNull()
    expect(razao!).toBeGreaterThan(13)
  })

  it('parseCor aceita as duas notacoes e recusa o resto', () => {
    expect(parseCor('#002e5d')).not.toBeNull()
    expect(parseCor('oklch(50% 0.1 200)')).not.toBeNull()
    expect(parseCor('4px')).toBeNull()
    expect(parseCor('var(--marca-cyan)')).toBeNull()
  })
})

describe('leitura dos tokens', () => {
  it('encontra os tres blocos', () => {
    expect(Object.keys(temas.claro).length).toBeGreaterThan(20)
    expect(Object.keys(temas.escuroPorPreferencia).length).toBeGreaterThan(20)
    expect(Object.keys(temas.escuroPorEscolha).length).toBeGreaterThan(20)
  })

  it('o tema escuro herda o claro e redefine as cores', () => {
    // Os raios nao mudam no escuro, portanto vem do claro.
    expect(temas.escuroPorEscolha['--radius-sm']).toBe(temas.claro['--radius-sm'])
    // A superficie muda.
    expect(temas.escuroPorEscolha['--surface-page']).not.toBe(temas.claro['--surface-page'])
  })

  it('resolve as referencias var() para cores', () => {
    // --surface-raised e `var(--marca-branco)` no ficheiro.
    expect(temas.claro['--surface-raised']).toBe('#ffffff')
    expect(temas.claro['--accent']).toBe('#002e5d')
  })

  it('nenhum token de cor fica com var() sem resolver', () => {
    for (const [nome, tema] of Object.entries(temas)) {
      for (const [token, valor] of Object.entries(tema)) {
        expect(valor, `${nome} ${token} ficou por resolver`).not.toContain('var(')
      }
    }
  })
})

/*
 * Os dois blocos de tema escuro sao duplicados de proposito, para nao apoiar a
 * paleta inteira em `light-dark()`. A duplicacao precisa de guarda: sem este
 * teste, editar um bloco e esquecer o outro daria temas diferentes conforme o
 * escuro viesse do sistema ou de uma escolha do utilizador.
 */
describe('os dois blocos de tema escuro', () => {
  const porPreferencia = lerBloco(css, 'escuroPorPreferencia')
  const porEscolha = lerBloco(css, 'escuroPorEscolha')

  it('declaram exatamente os mesmos tokens', () => {
    expect(Object.keys(porEscolha).sort()).toEqual(Object.keys(porPreferencia).sort())
  })

  it('declaram exatamente os mesmos valores', () => {
    expect(porEscolha).toEqual(porPreferencia)
  })

  it('nao estao vazios', () => {
    expect(Object.keys(porPreferencia).length).toBeGreaterThan(20)
  })
})

/*
 * A paleta e a unica parte do ficheiro que copia o manual. Se um destes valores
 * mudar, deixou de ser a cor da marca, e nenhum outro teste daria por isso: um
 * azul errado passa o contraste tao bem como o certo.
 *
 * Manual_Identidade_Caetano_042026.pdf, paginas 12 a 14.
 */
describe('paleta da marca', () => {
  const DO_MANUAL: Readonly<Record<string, string>> = {
    '--marca-azul-profundo': '#002e5d',
    '--marca-antracite': '#2e3a46',
    '--marca-cinza-medio': '#9caeb8',
    '--marca-cyan': '#00aeef',
    '--marca-verde': '#49b489',
    '--marca-laranja': '#ffa931',
    '--marca-amarelo': '#ffd23f',
    '--marca-ultra-branco': '#ffffff',
    '--marca-azul-ceu': '#99dff9',
    '--marca-verde-pastel': '#a8d5ba',
    '--marca-azul-profundo-t1': '#33587d',
    '--marca-azul-profundo-t4': '#ccd5df',
    '--marca-antracite-t1': '#58616b',
    '--marca-cinza-medio-t2': '#c4ced4',
    '--marca-cinza-medio-t3': '#d7dfe3',
    '--marca-cinza-medio-t4': '#ebeff1',
    '--marca-cyan-t1': '#33bef2',
    '--marca-verde-t1': '#6dc3a1',
    '--marca-verde-t4': '#dbf0e7',
    '--marca-laranja-t1': '#ffba5a',
    '--marca-laranja-t4': '#ffeed6',
    '--marca-amarelo-t1': '#ffdb65',
    '--marca-amarelo-t4': '#fff6d9',
  }

  for (const [token, valor] of Object.entries(DO_MANUAL)) {
    it(`${token} e ${valor}`, () => {
      expect(temas.claro[token]).toBe(valor)
    })
  }

  it('o azul ceu coincide com o terceiro tint do cyan', () => {
    // Nao e engano nem duplicacao: a pagina 11 nomeia-o como cor secundaria e a
    // 12 mostra o mesmo valor como tint. Se um dos dois mudar, este teste diz.
    expect(temas.claro['--marca-azul-ceu']).toBe(temas.claro['--marca-cyan-t3'])
  })

  it('o verde pastel nao pertence a escala de tints do verde', () => {
    // Confirma que e uma cor propria, e nao uma copia de um degrau existente.
    const tints = ['t1', 't2', 't3', 't4'].map((t) => temas.claro[`--marca-verde-${t}`])
    expect(tints).not.toContain(temas.claro['--marca-verde-pastel'])
  })

  it('o tema escuro nao redefine a paleta', () => {
    // A paleta e a marca. Um tema pode escolher outra cor da paleta para um
    // papel, mas nao pode mudar o que a cor da marca e.
    for (const token of Object.keys(DO_MANUAL)) {
      expect(lerBloco(css, 'escuroPorEscolha')[token]).toBeUndefined()
    }
  })
})

for (const [nome, tema] of [
  ['tema claro', temas.claro],
  ['tema escuro', temas.escuroPorEscolha],
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
