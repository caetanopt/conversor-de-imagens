/**
 * Geometria do corte.
 *
 * Testa o que o rato faz, sem rato: cada gesto da ferramenta do Photoshop
 * corresponde a uma chamada aqui. Os casos escolhidos sao os que estragam uma
 * ferramenta de corte na pratica, e nao o caminho felz:
 *
 *  - arrastar um manipulo para alem do lado oposto;
 *  - encostar a proporcao travada ao limite da imagem;
 *  - escrever dimensoes maiores do que a imagem;
 *  - mover o corte contra as bordas.
 */
import { describe, expect, it } from 'vitest'

import {
  CORTE_MINIMO,
  corteEInteiro,
  corteInicial,
  corteParaProporcao,
  definirDimensoes,
  limitarCorte,
  moverCorte,
  proporcaoDoCorte,
  proporcaoPorId,
  PROPORCOES,
  redimensionarPorManipulo,
  trocarDimensoes,
  valorDaProporcao,
  type CropRect,
  type Manipulo,
} from '@/features/converter/state/crop'

const IMAGEM = { width: 400, height: 300 }
const dentro = (r: CropRect, l = IMAGEM) =>
  r.x >= 0 && r.y >= 0 && r.x + r.width <= l.width && r.y + r.height <= l.height

describe('limitarCorte', () => {
  it('deixa em paz um retangulo que ja cabe', () => {
    expect(limitarCorte({ x: 10, y: 20, width: 100, height: 50 }, IMAGEM)).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    })
  })

  it('encolhe o que e maior que a imagem', () => {
    expect(limitarCorte({ x: 0, y: 0, width: 900, height: 900 }, IMAGEM)).toEqual({
      x: 0,
      y: 0,
      width: 400,
      height: 300,
    })
  })

  it('empurra para dentro o que transborda, sem encolher', () => {
    // Um corte de 100x50 em x=380 nao cabe: tem de recuar para x=300, e nao
    // ficar com 20 de largura. Encolher perderia o enquadramento escolhido.
    expect(limitarCorte({ x: 380, y: 290, width: 100, height: 50 }, IMAGEM)).toEqual({
      x: 300,
      y: 250,
      width: 100,
      height: 50,
    })
  })

  it('recusa coordenadas negativas', () => {
    expect(limitarCorte({ x: -50, y: -50, width: 100, height: 100 }, IMAGEM)).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    })
  })

  it('nunca devolve um lado abaixo do minimo', () => {
    const r = limitarCorte({ x: 10, y: 10, width: 0, height: -5 }, IMAGEM)
    expect(r.width).toBe(CORTE_MINIMO)
    expect(r.height).toBe(CORTE_MINIMO)
  })

  it('devolve sempre inteiros: um corte nao tem meio pixel', () => {
    const r = limitarCorte({ x: 10.4, y: 20.6, width: 100.5, height: 50.5 }, IMAGEM)
    for (const v of [r.x, r.y, r.width, r.height]) expect(Number.isInteger(v)).toBe(true)
  })
})

describe('proporcoes', () => {
  it('a lista tem ids unicos', () => {
    const ids = PROPORCOES.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("'original' e calculada a partir da imagem, nao fixa", () => {
    expect(proporcaoPorId('original').valor).toBeNull()
    expect(valorDaProporcao('original', { width: 400, height: 300 })).toBeCloseTo(4 / 3)
    expect(valorDaProporcao('original', { width: 300, height: 400 })).toBeCloseTo(3 / 4)
  })

  it("'livre' nao impoe nada", () => {
    expect(valorDaProporcao('livre', IMAGEM)).toBeNull()
  })

  it('as fixas nao dependem da imagem', () => {
    expect(valorDaProporcao('1:1', IMAGEM)).toBe(1)
    expect(valorDaProporcao('16:9', { width: 10, height: 10 })).toBeCloseTo(16 / 9)
  })

  it('uma imagem sem altura nao rebenta', () => {
    expect(valorDaProporcao('original', { width: 400, height: 0 })).toBeNull()
  })
})

describe('corteParaProporcao', () => {
  it('ocupa o maximo possivel e fica centrado', () => {
    // 1:1 num 400x300 da 300x300, centrado horizontalmente.
    expect(corteParaProporcao(IMAGEM, 1)).toEqual({ x: 50, y: 0, width: 300, height: 300 })
  })

  it('numa proporcao mais larga que a imagem, limita pela largura', () => {
    // 16:9 num 400x300: 400x225, centrado verticalmente.
    const r = corteParaProporcao(IMAGEM, 16 / 9)
    expect(r.width).toBe(400)
    expect(r.height).toBe(225)
    expect(r.y).toBe(38)
    expect(dentro(r)).toBe(true)
  })

  it('livre devolve a imagem inteira', () => {
    expect(corteParaProporcao(IMAGEM, null)).toEqual({ x: 0, y: 0, width: 400, height: 300 })
  })

  it('uma proporcao invalida nao produz um retangulo invalido', () => {
    for (const v of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(corteParaProporcao(IMAGEM, v)).toEqual({ x: 0, y: 0, width: 400, height: 300 })
    }
  })
})

describe('redimensionarPorManipulo, proporcao livre', () => {
  const meio: CropRect = { x: 100, y: 75, width: 200, height: 150 }

  it('cada manipulo mexe apenas nas suas bordas', () => {
    const casos: readonly [Manipulo, Partial<CropRect>][] = [
      ['oeste', { x: 120, width: 180 }],
      ['este', { width: 220 }],
      ['norte', { y: 95, height: 130 }],
      ['sul', { height: 170 }],
    ]
    for (const [manipulo, esperado] of casos) {
      const r = redimensionarPorManipulo(meio, manipulo, 20, 20, IMAGEM, null)
      expect({ ...meio, ...esperado }, manipulo).toEqual(r)
    }
  })

  it('um canto mexe nas duas', () => {
    expect(redimensionarPorManipulo(meio, 'sudeste', 20, 20, IMAGEM, null)).toEqual({
      x: 100,
      y: 75,
      width: 220,
      height: 170,
    })
    expect(redimensionarPorManipulo(meio, 'noroeste', 20, 20, IMAGEM, null)).toEqual({
      x: 120,
      y: 95,
      width: 180,
      height: 130,
    })
  })

  it('arrastar para alem do lado oposto troca as bordas em vez de colapsar', () => {
    // Puxar 'oeste' 260 px para a direita passa a direita (que esta em 300).
    const r = redimensionarPorManipulo(meio, 'oeste', 260, 0, IMAGEM, null)
    expect(r.width).toBe(60)
    expect(r.x).toBe(300)
    expect(dentro(r)).toBe(true)
  })

  it('nunca sai da imagem, por muito que se arraste', () => {
    for (const manipulo of ['noroeste', 'nordeste', 'sudoeste', 'sudeste'] as const) {
      for (const d of [-5000, 5000]) {
        const r = redimensionarPorManipulo(meio, manipulo, d, d, IMAGEM, null)
        expect(dentro(r), `${manipulo} com ${d}`).toBe(true)
      }
    }
  })
})

describe('redimensionarPorManipulo, proporcao travada', () => {
  it('um canto mantem a proporcao e a ancora oposta', () => {
    const rect: CropRect = { x: 100, y: 100, width: 100, height: 100 }
    const r = redimensionarPorManipulo(rect, 'sudeste', 50, 0, IMAGEM, 1)
    // Arrastar so em x tem de crescer tambem em y, e o canto NO fica quieto.
    expect(r.x).toBe(100)
    expect(r.y).toBe(100)
    expect(r.width).toBe(150)
    expect(r.height).toBe(150)
  })

  it('a ancora de um canto e o canto oposto, nao a origem', () => {
    const rect: CropRect = { x: 100, y: 100, width: 100, height: 100 }
    const r = redimensionarPorManipulo(rect, 'noroeste', -50, 0, IMAGEM, 1)
    // O canto SE (200,200) tem de continuar em 200,200.
    expect(r.x + r.width).toBe(200)
    expect(r.y + r.height).toBe(200)
    expect(r.width).toBe(150)
  })

  it('um manipulo de lado cresce simetricamente no eixo livre', () => {
    const rect: CropRect = { x: 100, y: 100, width: 100, height: 100 }
    const r = redimensionarPorManipulo(rect, 'este', 50, 0, IMAGEM, 1)
    expect(r.width).toBe(150)
    expect(r.height).toBe(150)
    // O centro vertical nao se mexeu: 150 antes, 150 depois.
    expect(r.y + r.height / 2).toBe(150)
  })

  it('encostar ao limite da imagem NAO deforma a proporcao', () => {
    // E o defeito classico: chegar a borda e o retangulo achatar.
    const rect: CropRect = { x: 0, y: 0, width: 100, height: 100 }
    const r = redimensionarPorManipulo(rect, 'sudeste', 5000, 5000, IMAGEM, 1)
    expect(r.width).toBe(r.height)
    expect(dentro(r)).toBe(true)
    // Num 400x300, o maior quadrado e 300x300.
    expect(r.width).toBe(300)
  })

  it('mantem a proporcao em qualquer arrasto, em todos os manipulos', () => {
    const rect: CropRect = { x: 120, y: 90, width: 160, height: 90 }
    const alvo = 16 / 9
    const manipulos: readonly Manipulo[] = [
      'noroeste', 'norte', 'nordeste', 'oeste', 'este', 'sudoeste', 'sul', 'sudeste',
    ]
    for (const manipulo of manipulos) {
      for (const [dx, dy] of [[30, 0], [0, 30], [-40, -40], [200, 200], [-500, 300]] as const) {
        const r = redimensionarPorManipulo(rect, manipulo, dx, dy, IMAGEM, alvo)
        expect(dentro(r), `${manipulo} ${dx},${dy} saiu da imagem`).toBe(true)
        // Tolerancia de 1 px por lado: o retangulo e arredondado a inteiros.
        const razao = r.width / r.height
        expect(
          Math.abs(razao - alvo),
          `${manipulo} ${dx},${dy}: proporcao ${razao.toFixed(3)} contra ${alvo.toFixed(3)}`,
        ).toBeLessThan(0.06)
      }
    }
  })
})

describe('moverCorte', () => {
  it('desloca sem mudar as dimensoes', () => {
    const r = moverCorte({ x: 100, y: 100, width: 80, height: 60 }, 20, -30, IMAGEM)
    expect(r).toEqual({ x: 120, y: 70, width: 80, height: 60 })
  })

  it('trava nas bordas em vez de sair', () => {
    const rect: CropRect = { x: 100, y: 100, width: 80, height: 60 }
    expect(moverCorte(rect, -5000, -5000, IMAGEM)).toEqual({ ...rect, x: 0, y: 0 })
    expect(moverCorte(rect, 5000, 5000, IMAGEM)).toEqual({ ...rect, x: 320, y: 240 })
  })

  it('travar nao encolhe o corte', () => {
    const rect: CropRect = { x: 0, y: 0, width: 400, height: 300 }
    const r = moverCorte(rect, 100, 100, IMAGEM)
    expect(r.width).toBe(400)
    expect(r.height).toBe(300)
  })
})

describe('definirDimensoes', () => {
  const centrado: CropRect = { x: 150, y: 100, width: 100, height: 100 }

  it('mantem o centro ao mudar um lado', () => {
    const r = definirDimensoes(centrado, 50, null, IMAGEM, null)
    expect(r.width).toBe(50)
    // Centro em 200 antes e depois.
    expect(r.x + r.width / 2).toBe(200)
  })

  it('com proporcao travada, a dimensao escrita manda e a outra segue', () => {
    const r = definirDimensoes(centrado, 160, null, IMAGEM, 16 / 9)
    expect(r.width).toBe(160)
    expect(r.height).toBe(90)
  })

  it('escrever a altura com proporcao travada recalcula a largura', () => {
    const r = definirDimensoes(centrado, null, 90, IMAGEM, 16 / 9)
    expect(r.height).toBe(90)
    expect(r.width).toBe(160)
  })

  it('dimensoes maiores que a imagem sao travadas, nao aceitas', () => {
    // O motor tambem as cortaria em silencio: medido, pedir 600x400 num 400x300
    // devolve 400x300. Travar aqui deixa a interface mostrar a verdade.
    const r = definirDimensoes(centrado, 900, 900, IMAGEM, null)
    expect(r.width).toBe(400)
    expect(r.height).toBe(300)
  })

  it('null nas duas dimensoes nao muda nada', () => {
    expect(definirDimensoes(centrado, null, null, IMAGEM, null)).toEqual(centrado)
  })
})

describe('trocarDimensoes', () => {
  it('troca largura por altura mantendo o centro', () => {
    const r = trocarDimensoes({ x: 150, y: 100, width: 100, height: 60 }, IMAGEM)
    expect(r.width).toBe(60)
    expect(r.height).toBe(100)
    expect(r.x + r.width / 2).toBe(200)
    expect(r.y + r.height / 2).toBe(130)
  })

  it('trocar duas vezes volta ao inicio', () => {
    const inicio: CropRect = { x: 150, y: 100, width: 100, height: 60 }
    expect(trocarDimensoes(trocarDimensoes(inicio, IMAGEM), IMAGEM)).toEqual(inicio)
  })

  it('uma troca que nao cabe fica travada dentro da imagem', () => {
    // 380 de largura trocado daria 380 de altura num 400x300.
    const r = trocarDimensoes({ x: 10, y: 10, width: 380, height: 100 }, IMAGEM)
    expect(dentro(r)).toBe(true)
    expect(r.height).toBe(300)
  })
})

describe('corteEInteiro', () => {
  it('reconhece o corte que nao corta nada', () => {
    expect(corteEInteiro(corteInicial(IMAGEM), IMAGEM)).toBe(true)
  })

  it('um pixel a menos ja e um corte', () => {
    expect(corteEInteiro({ x: 0, y: 0, width: 399, height: 300 }, IMAGEM)).toBe(false)
    expect(corteEInteiro({ x: 1, y: 0, width: 399, height: 300 }, IMAGEM)).toBe(false)
  })
})

describe('proporcaoDoCorte', () => {
  it('reconhece as proporcoes da lista', () => {
    expect(proporcaoDoCorte({ x: 0, y: 0, width: 100, height: 100 })).toBe('1:1')
    expect(proporcaoDoCorte({ x: 0, y: 0, width: 1600, height: 900 })).toBe('16:9')
  })

  it('mostra um numero quando nao e nenhuma delas, com virgula decimal', () => {
    // Portugues de Portugal: separador decimal e a virgula. CLAUDE.md, seccao 15.
    expect(proporcaoDoCorte({ x: 0, y: 0, width: 137, height: 100 })).toBe('1,37')
  })

  it('nao divide por zero', () => {
    expect(proporcaoDoCorte({ x: 0, y: 0, width: 100, height: 0 })).toBe('—')
  })
})
