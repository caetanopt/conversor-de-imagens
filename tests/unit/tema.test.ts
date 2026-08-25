/**
 * Preferencia de tema.
 *
 * A logica e pequena mas tem tres pontos onde um erro nao daria erro visivel:
 * o ciclo do botao, o significado de 'sistema' como ausencia de atributo, e o
 * comportamento quando localStorage lanca. Os tres estao cobertos aqui.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  aplicarTema,
  ATRIBUTO_DO_TEMA,
  CHAVE_DO_TEMA,
  eTema,
  guardarTema,
  lerTemaGuardado,
  proximoTema,
  ROTULOS,
  SCRIPT_ANTES_DO_PAINT,
  TEMA_POR_DEFEITO,
  TEMAS,
  type Tema,
} from '@/lib/tema/tema'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute(ATRIBUTO_DO_TEMA)
})

describe('eTema', () => {
  it('aceita os tres valores e recusa o resto', () => {
    for (const t of TEMAS) expect(eTema(t)).toBe(true)
    expect(eTema('dark')).toBe(false)
    expect(eTema('')).toBe(false)
    expect(eTema(null)).toBe(false)
    expect(eTema(undefined)).toBe(false)
    expect(eTema(1)).toBe(false)
    // Um objeto com toString nao passa: a verificacao e de tipo, nao de forma.
    expect(eTema({ toString: () => 'claro' })).toBe(false)
  })
})

describe('proximoTema', () => {
  it('cicla pelos tres e volta ao inicio', () => {
    expect(proximoTema('sistema')).toBe('claro')
    expect(proximoTema('claro')).toBe('escuro')
    expect(proximoTema('escuro')).toBe('sistema')
  })

  it('tres cliques a partir de qualquer estado devolvem o mesmo estado', () => {
    for (const inicio of TEMAS) {
      expect(proximoTema(proximoTema(proximoTema(inicio)))).toBe(inicio)
    }
  })
})

describe('ROTULOS', () => {
  it('tem um rotulo em portugues para cada tema', () => {
    for (const t of TEMAS) {
      expect(ROTULOS[t]).toBeTruthy()
      // O rotulo aparece no nome acessivel do botao, portanto nao pode ser o
      // identificador interno.
      expect(ROTULOS[t]).not.toBe(t)
    }
    expect(ROTULOS.sistema).toBe('Automático')
  })
})

describe('guardarTema e lerTemaGuardado', () => {
  it('guarda e le uma escolha explicita', () => {
    guardarTema('escuro')
    expect(localStorage.getItem(CHAVE_DO_TEMA)).toBe('escuro')
    expect(lerTemaGuardado()).toBe('escuro')
  })

  it("'sistema' apaga a chave em vez de a guardar", () => {
    guardarTema('claro')
    expect(localStorage.getItem(CHAVE_DO_TEMA)).toBe('claro')
    guardarTema('sistema')
    // A ausencia de escolha nao deixa vestigio. Ver docs/privacidade.md.
    expect(localStorage.getItem(CHAVE_DO_TEMA)).toBeNull()
    expect(Object.keys(localStorage)).toHaveLength(0)
  })

  it('nunca guarda mais do que uma chave', () => {
    for (const t of [...TEMAS, ...TEMAS]) guardarTema(t)
    expect(Object.keys(localStorage).length).toBeLessThanOrEqual(1)
  })

  it('devolve o valor por defeito quando nao existe nada guardado', () => {
    expect(lerTemaGuardado()).toBe(TEMA_POR_DEFEITO)
  })

  it('ignora um valor guardado que nao seja um tema', () => {
    // Alguem pode editar o valor a mao, ou uma versao futura pode mudar o
    // formato. Nesse caso a aplicacao segue o sistema em vez de falhar.
    localStorage.setItem(CHAVE_DO_TEMA, 'purpura')
    expect(lerTemaGuardado()).toBe(TEMA_POR_DEFEITO)
  })

  it('sobrevive a um localStorage que lanca', () => {
    // Acontece em modo privado em alguns browsers.
    const ler = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('acesso negado')
    })
    const escrever = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('acesso negado')
    })

    expect(lerTemaGuardado()).toBe(TEMA_POR_DEFEITO)
    expect(() => guardarTema('escuro')).not.toThrow()

    ler.mockRestore()
    escrever.mockRestore()
  })
})

describe('aplicarTema', () => {
  it('poe o atributo para uma escolha explicita', () => {
    const raiz = document.documentElement
    aplicarTema('escuro', raiz)
    expect(raiz.getAttribute(ATRIBUTO_DO_TEMA)).toBe('escuro')
    aplicarTema('claro', raiz)
    expect(raiz.getAttribute(ATRIBUTO_DO_TEMA)).toBe('claro')
  })

  it("'sistema' remove o atributo, e nao o poe a 'sistema'", () => {
    const raiz = document.documentElement
    aplicarTema('escuro', raiz)
    aplicarTema('sistema', raiz)
    // E a ausencia do atributo que devolve a decisao ao prefers-color-scheme.
    // Um atributo com o valor 'sistema' nao corresponderia a nenhum seletor do
    // CSS e o tema ficaria preso no claro.
    expect(raiz.hasAttribute(ATRIBUTO_DO_TEMA)).toBe(false)
  })
})

describe('script aplicado antes do paint', () => {
  it('menciona a chave e o atributo reais', () => {
    // Se um deles for renomeado sem o script acompanhar, o tema volta a piscar
    // e nada mais falharia.
    expect(SCRIPT_ANTES_DO_PAINT).toContain(CHAVE_DO_TEMA)
    expect(SCRIPT_ANTES_DO_PAINT).toContain(ATRIBUTO_DO_TEMA)
  })

  it('aplica o tema guardado ao documento', () => {
    localStorage.setItem(CHAVE_DO_TEMA, 'escuro')
    // `new Function` e exatamente o que o browser faz com o script inline do
    // layout; executa-lo aqui e o unico modo de verificar que funciona.
    new Function(SCRIPT_ANTES_DO_PAINT)()
    expect(document.documentElement.getAttribute(ATRIBUTO_DO_TEMA)).toBe('escuro')
  })

  it('nao aplica nada quando nada esta guardado', () => {
    new Function(SCRIPT_ANTES_DO_PAINT)()
    expect(document.documentElement.hasAttribute(ATRIBUTO_DO_TEMA)).toBe(false)
  })

  it('ignora um valor invalido em vez de o aplicar ao documento', () => {
    localStorage.setItem(CHAVE_DO_TEMA, 'sistema')
    new Function(SCRIPT_ANTES_DO_PAINT)()
    // 'sistema' guardado seria um estado que guardarTema nunca produz, mas o
    // script tem de o tratar como ausencia de escolha e nao como atributo.
    expect(document.documentElement.hasAttribute(ATRIBUTO_DO_TEMA)).toBe(false)
  })

  it('e uma expressao imediatamente invocada, para nao deixar nomes globais', () => {
    expect(SCRIPT_ANTES_DO_PAINT.startsWith('(function()')).toBe(true)
    expect(SCRIPT_ANTES_DO_PAINT.trimEnd().endsWith('()')).toBe(true)
  })
})

describe('TEMAS', () => {
  it('comeca no valor por defeito, que e o que o primeiro render assume', () => {
    expect(TEMAS[0]).toBe(TEMA_POR_DEFEITO)
  })

  it('nao tem repetidos', () => {
    expect(new Set<Tema>(TEMAS).size).toBe(TEMAS.length)
  })
})
