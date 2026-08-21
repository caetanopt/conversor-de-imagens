import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  contarObjectUrlsAtivos,
  criarObjectUrl,
  revogarObjectUrl,
  revogarTodosOsObjectUrls,
} from '@/lib/files/objectUrls'

// jsdom nao implementa a API de object URLs.
let contador = 0
URL.createObjectURL = vi.fn(() => `blob:teste/${(contador += 1)}`)
URL.revokeObjectURL = vi.fn()

afterEach(() => {
  revogarTodosOsObjectUrls()
})

describe('registo de object URLs', () => {
  it('conta os URLs criados', () => {
    expect(contarObjectUrlsAtivos()).toBe(0)
    criarObjectUrl(new Blob(['a']))
    criarObjectUrl(new Blob(['b']))
    expect(contarObjectUrlsAtivos()).toBe(2)
  })

  it('revogar liberta o registo', () => {
    const url = criarObjectUrl(new Blob(['a']))
    revogarObjectUrl(url)
    expect(contarObjectUrlsAtivos()).toBe(0)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url)
  })

  it('revogar duas vezes nao chama o browser duas vezes', () => {
    const url = criarObjectUrl(new Blob(['a']))
    vi.mocked(URL.revokeObjectURL).mockClear()
    revogarObjectUrl(url)
    revogarObjectUrl(url)
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
  })

  it('tolera null e undefined, para as chamadas de limpeza serem simples', () => {
    expect(() => revogarObjectUrl(null)).not.toThrow()
    expect(() => revogarObjectUrl(undefined)).not.toThrow()
  })

  it('nao revoga um URL que nao criou', () => {
    vi.mocked(URL.revokeObjectURL).mockClear()
    revogarObjectUrl('blob:de-outro-sitio')
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  })

  it('a limpeza total nao deixa nada pendente', () => {
    criarObjectUrl(new Blob(['a']))
    criarObjectUrl(new Blob(['b']))
    revogarTodosOsObjectUrls()
    // Invariante: no fim de um fluxo nao pode ficar nenhum URL vivo, senao os
    // bytes da imagem permanecem em memoria durante a sessao.
    expect(contarObjectUrlsAtivos()).toBe(0)
  })
})
