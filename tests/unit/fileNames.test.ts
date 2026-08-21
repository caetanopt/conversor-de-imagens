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

  describe('nomes Unicode', () => {
    it('preserva acentos do portugues', () => {
      expect(trocarExtensao('fotografia-férias-ção.jpg', 'webp')).toBe(
        'fotografia-férias-ção.webp',
      )
    })

    it('preserva caracteres nao latinos', () => {
      expect(trocarExtensao('日本語のファイル.png', 'webp')).toBe('日本語のファイル.webp')
      expect(trocarExtensao('Привет.jpg', 'png')).toBe('Привет.png')
    })

    it('preserva emoji', () => {
      expect(trocarExtensao('ferias-🙂.jpg', 'webp')).toBe('ferias-🙂.webp')
    })

    it('nao normaliza a forma de composicao Unicode', () => {
      // 'ção' pode existir em NFC (c-cedilha precomposto) ou NFD (c mais
      // cedilha combinante). O nome tem de sair exatamente como entrou, senao
      // o ficheiro descarregado deixa de corresponder ao original em sistemas
      // de ficheiros sensiveis a forma.
      const nfc = 'con\u00e7\u00e3o.jpg'
      const nfd = 'conc\u0327a\u0303o.jpg'
      expect(nfc).not.toBe(nfd)
      expect(trocarExtensao(nfc, 'webp')).toBe('con\u00e7\u00e3o.webp')
      expect(trocarExtensao(nfd, 'webp')).toBe('conc\u0327a\u0303o.webp')
    })

    it('conta caracteres e nao unidades de codigo ao remover a extensao', () => {
      // Um emoji ocupa duas unidades UTF-16. Um lastIndexOf mal feito partiria
      // o par e produziria um nome invalido.
      expect(removerExtensao('🙂🙂🙂.jpg')).toBe('🙂🙂🙂')
    })
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
