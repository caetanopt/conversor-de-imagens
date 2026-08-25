/**
 * Identificadores de trabalho.
 *
 * O caso que importa nao e o caminho feliz: e o browser sem
 * `crypto.randomUUID`, que acontece em qualquer pagina servida por HTTP
 * simples. Antes disto, selecionar um ficheiro nesse contexto nao fazia nada e
 * nao dizia nada.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { novoId } from '@/lib/ids'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('novoId', () => {
  it('produz um UUID v4', () => {
    expect(novoId()).toMatch(UUID)
  })

  it('nao repete', () => {
    const ids = new Set(Array.from({ length: 500 }, () => novoId()))
    expect(ids.size).toBe(500)
  })

  it('funciona sem randomUUID, como num contexto nao seguro', () => {
    // `randomUUID` exige contexto seguro; `getRandomValues` nao. E este o caso
    // de um telefone a abrir a aplicacao pelo IP da rede local.
    vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) })

    const id = novoId()
    expect(id).toMatch(UUID)
    expect(new Set(Array.from({ length: 200 }, () => novoId())).size).toBe(200)
  })

  it('funciona sem crypto nenhum', () => {
    vi.stubGlobal('crypto', undefined)
    expect(novoId()).toMatch(UUID)
    expect(new Set(Array.from({ length: 200 }, () => novoId())).size).toBe(200)
  })

  it('nunca contem o nome de um ficheiro, porque nao recebe nenhum', () => {
    // CLAUDE.md, seccao 10. A funcao nao tem parametros, portanto nao ha por
    // onde um nome entrar.
    expect(novoId.length).toBe(0)
  })
})
