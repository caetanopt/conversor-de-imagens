/**
 * limparMetadados: cirurgia no contentor, sem recodificar pixeis.
 *
 * Os contentores sao construidos byte a byte em vez de sairem de fixtures,
 * porque o que esta em teste e o passeio pela estrutura: preciso de controlar
 * exatamente que blocos existem, em que ordem, com e sem preenchimento. As
 * fixtures reais entram nos testes do motor e nos e2e, onde o que importa e
 * o ficheiro continuar a ser descodificavel.
 */
import { describe, expect, it } from 'vitest'

import { limparMetadados } from '@/lib/files/stripMetadata'

function bytes(...valores: readonly number[]): Uint8Array<ArrayBuffer> {
  return new Uint8Array(valores)
}

function ascii(texto: string): number[] {
  return [...texto].map((c) => c.charCodeAt(0))
}

// ---------------------------------------------------------------------------
// JPEG
// ---------------------------------------------------------------------------

/** Segmento `FF <marcador> <comprimento> <payload>`. */
function segmentoJpeg(marcador: number, payload: readonly number[]): number[] {
  const comprimento = payload.length + 2
  return [0xff, marcador, (comprimento >> 8) & 0xff, comprimento & 0xff, ...payload]
}

function jpegCom(...segmentos: readonly number[][]): Uint8Array<ArrayBuffer> {
  return bytes(
    0xff,
    0xd8, // SOI
    ...segmentos.flat(),
    0xff,
    0xda, // SOS
    0x00,
    0x03,
    0x01, // cabecalho do SOS
    0xaa,
    0xbb,
    0xcc, // "pixeis"
    0xff,
    0xd9, // EOI
  )
}

const EXIF = segmentoJpeg(0xe1, [...ascii('Exif'), 0, 0, 0x11, 0x22])
const XMP = segmentoJpeg(0xe1, [...ascii('http://ns.adobe.com/xap/1.0/'), 0])
const ICC = segmentoJpeg(0xe2, [...ascii('ICC_PROFILE'), 0, 0x01, 0x02])
const IPTC = segmentoJpeg(0xed, [...ascii('Photoshop 3.0'), 0])
const COMENTARIO = segmentoJpeg(0xfe, ascii('gerado por qualquer coisa'))
const JFIF = segmentoJpeg(0xe0, [...ascii('JFIF'), 0, 0x01, 0x02])

describe('limparMetadados em JPEG', () => {
  it("com 'preservar-cor' tira EXIF, XMP, IPTC e comentario, e mantem o ICC", () => {
    const entrada = jpegCom(JFIF, EXIF, ICC, IPTC, COMENTARIO)
    const saida = limparMetadados(entrada, 'jpeg', 'preservar-cor')

    expect(saida).not.toBeNull()
    expect([...saida!.removidos].sort()).toEqual(['COM', 'EXIF', 'IPTC'])
    // O ICC sobrevive, para a imagem nao mudar de aspeto.
    expect(saida!.bytes.byteLength).toBe(jpegCom(JFIF, ICC).byteLength)
    expect([...saida!.bytes]).toEqual([...jpegCom(JFIF, ICC)])
  })

  it("com 'remover' tira tambem o perfil ICC", () => {
    const entrada = jpegCom(JFIF, EXIF, ICC)
    const saida = limparMetadados(entrada, 'jpeg', 'remover')

    expect([...saida!.removidos].sort()).toEqual(['EXIF', 'ICC'])
    expect([...saida!.bytes]).toEqual([...jpegCom(JFIF)])
  })

  it("com 'manter' devolve os bytes intactos", () => {
    const entrada = jpegCom(JFIF, EXIF, ICC, IPTC)
    const saida = limparMetadados(entrada, 'jpeg', 'manter')

    expect(saida!.removidos).toEqual([])
    expect(saida!.bytes).toBe(entrada)
  })

  it('distingue XMP de EXIF pelo identificador do APP1', () => {
    const saida = limparMetadados(jpegCom(XMP), 'jpeg', 'preservar-cor')
    expect(saida!.removidos).toEqual(['XMP'])
  })

  it('nunca cresce, e os pixeis a seguir ao SOS ficam byte a byte iguais', () => {
    const entrada = jpegCom(JFIF, EXIF, IPTC, COMENTARIO)
    const saida = limparMetadados(entrada, 'jpeg', 'preservar-cor')!

    expect(saida.bytes.byteLength).toBeLessThan(entrada.byteLength)
    // O SOS e tudo o que vem depois: os pixeis nao foram tocados.
    const cauda = [0xff, 0xda, 0x00, 0x03, 0x01, 0xaa, 0xbb, 0xcc, 0xff, 0xd9]
    expect([...saida.bytes.subarray(saida.bytes.byteLength - cauda.length)]).toEqual(cauda)
  })

  it('recusa bytes que nao comecam por SOI em vez de devolver lixo', () => {
    expect(limparMetadados(bytes(0x00, 0x01, 0x02, 0x03), 'jpeg', 'remover')).toBeNull()
  })

  it('recusa um segmento que diz ser maior do que o ficheiro', () => {
    // Comprimento 0x00FF num ficheiro com poucos bytes.
    const entrada = bytes(0xff, 0xd8, 0xff, 0xe1, 0x00, 0xff, 0x01, 0x02)
    expect(limparMetadados(entrada, 'jpeg', 'remover')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

const PNG_ASSINATURA = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** Bloco `comprimento(4) tipo(4) dados(n) crc(4)`. */
function blocoPng(tipo: string, dados: readonly number[]): number[] {
  const n = dados.length
  return [
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
    ...ascii(tipo),
    ...dados,
    0xde,
    0xad,
    0xbe,
    0xef, // CRC de fachada: os blocos mantidos nao sao alterados
  ]
}

function pngCom(...blocos: readonly number[][]): Uint8Array<ArrayBuffer> {
  return bytes(...PNG_ASSINATURA, ...blocos.flat(), ...blocoPng('IEND', []))
}

const IHDR = blocoPng('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0])
const IDAT = blocoPng('IDAT', [0x78, 0x9c, 0x01, 0x02])
const ICCP = blocoPng('iCCP', ascii('perfil'))

describe('limparMetadados em PNG', () => {
  it("com 'preservar-cor' tira eXIf e texto, e mantem o iCCP", () => {
    const entrada = pngCom(
      IHDR,
      ICCP,
      blocoPng('eXIf', [0x11, 0x22]),
      blocoPng('iTXt', ascii('autor')),
      blocoPng('tEXt', ascii('nota')),
      IDAT,
    )
    const saida = limparMetadados(entrada, 'png', 'preservar-cor')!

    expect([...saida.removidos].sort()).toEqual(['eXIf', 'iTXt', 'tEXt'])
    expect([...saida.bytes]).toEqual([...pngCom(IHDR, ICCP, IDAT)])
  })

  it("com 'remover' tira tambem o iCCP", () => {
    const entrada = pngCom(IHDR, ICCP, blocoPng('tIME', [0x07, 0xe9]), IDAT)
    const saida = limparMetadados(entrada, 'png', 'remover')!

    expect([...saida.removidos].sort()).toEqual(['iCCP', 'tIME'])
    expect([...saida.bytes]).toEqual([...pngCom(IHDR, IDAT)])
  })

  it('recusa uma assinatura que nao e PNG', () => {
    expect(limparMetadados(bytes(...ascii('nao e png!')), 'png', 'remover')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// WebP
// ---------------------------------------------------------------------------

/** Bloco `fourcc(4) tamanho(4) dados(n)`, com preenchimento se n for impar. */
function blocoWebp(fourcc: string, dados: readonly number[]): number[] {
  const n = dados.length
  return [
    ...ascii(fourcc),
    n & 0xff,
    (n >>> 8) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 24) & 0xff,
    ...dados,
    ...(n % 2 === 1 ? [0x00] : []),
  ]
}

function webpCom(...blocos: readonly number[][]): Uint8Array<ArrayBuffer> {
  const corpo = blocos.flat()
  const tamanho = 4 + corpo.length
  return bytes(
    ...ascii('RIFF'),
    tamanho & 0xff,
    (tamanho >>> 8) & 0xff,
    (tamanho >>> 16) & 0xff,
    (tamanho >>> 24) & 0xff,
    ...ascii('WEBP'),
    ...corpo,
  )
}

/** VP8X com os bits de ICC, EXIF e XMP ligados. */
function vp8x(flags: number): number[] {
  return blocoWebp('VP8X', [flags, 0, 0, 0, 0x0f, 0, 0, 0x0f, 0, 0])
}

const VP8 = blocoWebp('VP8 ', [0x01, 0x02, 0x03, 0x04])
const ICCP_WEBP = blocoWebp('ICCP', ascii('perfil'))

describe('limparMetadados em WebP', () => {
  it("com 'preservar-cor' tira EXIF e XMP, mantem o ICCP e corrige as flags do VP8X", () => {
    // 0x20 ICC, 0x08 EXIF, 0x04 XMP, todos declarados.
    const entrada = webpCom(
      vp8x(0x2c),
      ICCP_WEBP,
      VP8,
      blocoWebp('EXIF', [0x11, 0x22]),
      blocoWebp('XMP ', ascii('xmp')),
    )
    const saida = limparMetadados(entrada, 'webp', 'preservar-cor')!

    expect([...saida.removidos].sort()).toEqual(['EXIF', 'XMP '])
    // Sobra so o bit do ICC: anunciar EXIF sem EXIF seria ficheiro invalido.
    expect(saida.bytes[20]).toBe(0x20)
    expect([...saida.bytes]).toEqual([...webpCom(vp8x(0x20), ICCP_WEBP, VP8)])
  })

  it("com 'remover' tira o ICCP e limpa tambem esse bit", () => {
    // 0x28: ICC e EXIF, os dois blocos que este ficheiro tem de facto. As
    // flags declaram o que existe, por isso nao entra aqui o bit do XMP.
    const entrada = webpCom(vp8x(0x28), ICCP_WEBP, VP8, blocoWebp('EXIF', [0x11]))
    const saida = limparMetadados(entrada, 'webp', 'remover')!

    expect([...saida.removidos].sort()).toEqual(['EXIF', 'ICCP'])
    expect(saida.bytes[20]).toBe(0x00)
    expect([...saida.bytes]).toEqual([...webpCom(vp8x(0x00), VP8)])
  })

  it('atualiza o tamanho declarado no cabecalho RIFF', () => {
    const entrada = webpCom(vp8x(0x08), VP8, blocoWebp('EXIF', ascii('muitos bytes de exif')))
    const saida = limparMetadados(entrada, 'webp', 'preservar-cor')!

    const declarado = new DataView(saida.bytes.buffer).getUint32(4, true)
    expect(declarado).toBe(saida.bytes.byteLength - 8)
    expect(saida.bytes.byteLength).toBeLessThan(entrada.byteLength)
  })

  it('lida com o byte de preenchimento de um bloco de tamanho impar', () => {
    // 'EXIF' com 3 bytes leva um byte de preenchimento que tem de sair tambem.
    const entrada = webpCom(vp8x(0x08), VP8, blocoWebp('EXIF', [0x11, 0x22, 0x33]))
    const saida = limparMetadados(entrada, 'webp', 'preservar-cor')!

    expect([...saida.bytes]).toEqual([...webpCom(vp8x(0x00), VP8)])
  })

  it('sem nada para tirar devolve os mesmos bytes, sem os copiar', () => {
    const entrada = webpCom(VP8)
    const saida = limparMetadados(entrada, 'webp', 'preservar-cor')!

    expect(saida.removidos).toEqual([])
    expect(saida.bytes).toBe(entrada)
  })

  it('recusa um contentor que nao e RIFF/WEBP', () => {
    expect(limparMetadados(bytes(...ascii('RIFFxxxxAVI ')), 'webp', 'remover')).toBeNull()
  })
})

describe('limparMetadados nos formatos que nao sabe percorrer', () => {
  it("devolve null para AVIF, TIFF e GIF quando ha metadados a tirar", () => {
    const quaisquer = bytes(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12)
    expect(limparMetadados(quaisquer, 'avif', 'preservar-cor')).toBeNull()
    expect(limparMetadados(quaisquer, 'tiff', 'remover')).toBeNull()
    expect(limparMetadados(quaisquer, 'gif', 'preservar-cor')).toBeNull()
  })

  it("com 'manter' serve qualquer formato, porque nao ha nada a tirar", () => {
    const quaisquer = bytes(1, 2, 3, 4)
    const saida = limparMetadados(quaisquer, 'avif', 'manter')
    expect(saida!.bytes).toBe(quaisquer)
    expect(saida!.removidos).toEqual([])
  })
})
