import { describe, expect, it } from 'vitest'

import { detetarFormatoPorAssinatura, etiquetaDoFormato } from '@/lib/files/signature'

type Bytes = Uint8Array<ArrayBufferLike>

function bytes(...valores: number[]): Bytes {
  // 32 bytes: o mesmo tamanho de cabecalho que a aplicacao le.
  const buffer = new Uint8Array(32)
  buffer.set(valores)
  return buffer
}

function comTexto(offset: number, texto: string, base: Bytes = new Uint8Array(32)): Bytes {
  for (let i = 0; i < texto.length; i += 1) base[offset + i] = texto.charCodeAt(i)
  return base
}

describe('detetarFormatoPorAssinatura', () => {
  it('reconhece JPEG', () => {
    expect(detetarFormatoPorAssinatura(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('jpeg')
  })

  it('reconhece PNG', () => {
    expect(
      detetarFormatoPorAssinatura(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)),
    ).toBe('png')
  })

  it('reconhece WebP apenas com RIFF e WEBP nas posicoes certas', () => {
    const valido = comTexto(8, 'WEBP', comTexto(0, 'RIFF'))
    expect(detetarFormatoPorAssinatura(valido)).toBe('webp')

    // RIFF sem WEBP e outro contentor, por exemplo WAV. Nao e imagem.
    const soRiff = comTexto(8, 'WAVE', comTexto(0, 'RIFF'))
    expect(detetarFormatoPorAssinatura(soRiff)).toBeNull()
  })

  it('reconhece GIF', () => {
    expect(detetarFormatoPorAssinatura(comTexto(0, 'GIF89a'))).toBe('gif')
  })

  it('reconhece TIFF nas duas ordens de bytes', () => {
    expect(detetarFormatoPorAssinatura(bytes(0x49, 0x49, 0x2a, 0x00))).toBe('tiff')
    expect(detetarFormatoPorAssinatura(bytes(0x4d, 0x4d, 0x00, 0x2a))).toBe('tiff')
  })

  it('distingue AVIF de HEIC pela marca do contentor', () => {
    expect(detetarFormatoPorAssinatura(comTexto(8, 'avif', comTexto(4, 'ftyp')))).toBe('avif')
    expect(detetarFormatoPorAssinatura(comTexto(8, 'heic', comTexto(4, 'ftyp')))).toBe('heic')
    expect(detetarFormatoPorAssinatura(comTexto(8, 'mif1', comTexto(4, 'ftyp')))).toBe('heic')
  })

  it('nao aceita um contentor ISO desconhecido', () => {
    // mp42 e video. Nao deve passar por imagem.
    expect(detetarFormatoPorAssinatura(comTexto(8, 'mp42', comTexto(4, 'ftyp')))).toBeNull()
  })

  it('devolve null para conteudo que nao reconhece', () => {
    expect(detetarFormatoPorAssinatura(bytes(0x00, 0x11, 0x22, 0x33))).toBeNull()
    expect(detetarFormatoPorAssinatura(new Uint8Array(0))).toBeNull()
  })

  it('nao confia na extensao: um SVG renomeado para .png nao passa', () => {
    // '<svg' nao tem assinatura binaria conhecida na nossa tabela.
    expect(detetarFormatoPorAssinatura(comTexto(0, '<svg xmlns'))).toBeNull()
  })

  it('descreve o formato detetado', () => {
    expect(etiquetaDoFormato('jpeg')).toBe('JPG')
    expect(etiquetaDoFormato(null)).toBe('desconhecido')
  })
})
