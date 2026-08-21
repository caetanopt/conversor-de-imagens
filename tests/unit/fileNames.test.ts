import { describe, expect, it } from 'vitest'

import { nomeUnico, removerExtensao, trocarExtensao } from '@/lib/download/fileNames'

describe('trocarExtensao', () => {
  it('preserva o nome e troca apenas a extensao', () => {
    expect(trocarExtensao('fotografia-ferias.jpg', 'webp')).toBe('fotografia-ferias.webp')
    expect(trocarExtensao('captura.png', 'jpeg')).toBe('captura.jpg')
  })

  it('usa a extensao preferida do formato', () => {
    // jpeg tem jpg, jpeg e jfif. A saida usa a primeira.
    expect(trocarExtensao('a.png', 'jpeg')).toBe('a.jpg')
  })

  it('lida com nomes com varios pontos', () => {
    expect(trocarExtensao('foto.final.v2.jpeg', 'webp')).toBe('foto.final.v2.webp')
  })

  it('lida com nomes sem extensao', () => {
    expect(trocarExtensao('semextensao', 'png')).toBe('semextensao.png')
  })

  it('nao trata um ficheiro oculto como extensao', () => {
    expect(removerExtensao('.gitignore')).toBe('.gitignore')
    expect(trocarExtensao('.gitignore', 'png')).toBe('.gitignore.png')
  })
})

describe('nomeUnico', () => {
  it('devolve o nome quando nao ha colisao', () => {
    expect(nomeUnico('a.webp', new Set())).toBe('a.webp')
  })

  it('acrescenta um sufixo previsivel em caso de colisao', () => {
    expect(nomeUnico('a.webp', new Set(['a.webp']))).toBe('a-2.webp')
    expect(nomeUnico('a.webp', new Set(['a.webp', 'a-2.webp']))).toBe('a-3.webp')
  })
})
