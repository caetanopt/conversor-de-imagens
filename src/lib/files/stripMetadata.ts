/**
 * Remocao de metadados ao nivel do contentor, sem recodificar os pixeis.
 *
 * Porque existe: otimizar nao pode entregar um ficheiro maior do que o
 * original, CLAUDE.md seccao 12. Quando o encoder nao consegue melhorar uma
 * imagem que ja vem bem comprimida, o melhor resultado possivel e o proprio
 * original. Mas devolve-lo tal e qual reintroduzia os metadados que a politica
 * pediu para eliminar, e entre conveniencia e privacidade ganha a privacidade,
 * CLAUDE.md seccao 31.20.
 *
 * A saida deste modulo resolve as duas coisas ao mesmo tempo: os mesmos
 * pixeis, byte a byte, sem os metadados. Nunca e maior do que a entrada,
 * porque a unica coisa que faz e retirar blocos.
 *
 * Nao substitui o motor nem compete com ele. So sabe andar na estrutura do
 * contentor e saltar blocos: nao descodifica, nao recomprime, nao toca em
 * pixeis. Qualquer coisa inesperada devolve null, e quem chama fica com o
 * resultado do motor.
 */
import type { FormatId } from '@/config/formats'
import type { MetadataPolicy } from '@/features/converter/types'

export type LimpezaDeMetadados = {
  readonly bytes: Uint8Array<ArrayBuffer>
  /** Blocos retirados, pelo nome do contentor. Vazio quando nao havia nada. */
  readonly removidos: readonly string[]
}

/**
 * Devolve os bytes sem os metadados que a politica manda eliminar, ou null
 * quando o contentor nao e suportado ou a estrutura nao corresponde ao
 * esperado.
 *
 * Suporta JPEG, PNG e WebP. Sao os tres formatos onde otimizar no mesmo
 * formato recomprime de facto (os restantes ativos nao tem qualidade com
 * perda, ver ConversionModeControl) ou onde um original ja otimizado por
 * outra ferramenta pode bater o nosso encoder.
 */
export function limparMetadados(
  bytes: Uint8Array<ArrayBuffer>,
  formatId: FormatId,
  politica: MetadataPolicy,
): LimpezaDeMetadados | null {
  // 'manter' nao elimina nada, portanto o original ja cumpre a politica e
  // serve para qualquer formato, mesmo os que nao sabemos percorrer.
  if (politica === 'manter') return { bytes, removidos: [] }

  switch (formatId) {
    case 'jpeg':
      return limparJpeg(bytes, politica)
    case 'png':
      return limparPng(bytes, politica)
    case 'webp':
      return limparWebp(bytes, politica)
    default:
      return null
  }
}

function texto(bytes: Uint8Array, offset: number, comprimento: number): string {
  let saida = ''
  for (let i = 0; i < comprimento; i += 1) saida += String.fromCharCode(bytes[offset + i] ?? 0)
  return saida
}

function juntar(partes: readonly Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> {
  const total = partes.reduce((soma, parte) => soma + parte.byteLength, 0)
  const saida = new Uint8Array(total)
  let offset = 0
  for (const parte of partes) {
    saida.set(parte, offset)
    offset += parte.byteLength
  }
  return saida
}

/**
 * JPEG: sequencia de segmentos `FF <marcador> <comprimento> <payload>`.
 *
 * Retira os segmentos que transportam metadados e copia tudo o resto sem
 * tocar, incluindo os dados entropicos a seguir ao SOS, que sao os pixeis.
 */
function limparJpeg(bytes: Uint8Array<ArrayBuffer>, politica: MetadataPolicy): LimpezaDeMetadados | null {
  const fim = bytes.byteLength
  if (fim < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null

  const partes: Uint8Array<ArrayBuffer>[] = [bytes.subarray(0, 2)] // SOI
  const removidos: string[] = []
  let pos = 2

  while (pos < fim) {
    if (bytes[pos] !== 0xff) return null

    // Preenchimento: um segmento pode vir precedido de varios 0xFF.
    let m = pos + 1
    while (m < fim && bytes[m] === 0xff) m += 1
    if (m >= fim) return null
    const marcador = bytes[m]!

    // Marcadores sem payload.
    if (marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) {
      partes.push(bytes.subarray(pos, m + 1))
      pos = m + 1
      continue
    }

    // EOI: acabou a imagem.
    if (marcador === 0xd9) {
      partes.push(bytes.subarray(pos, m + 1))
      pos = m + 1
      break
    }

    // SOS: o resto do ficheiro sao os pixeis, copiados verbatim.
    if (marcador === 0xda) {
      partes.push(bytes.subarray(pos))
      pos = fim
      break
    }

    if (m + 2 >= fim) return null
    const comprimento = (bytes[m + 1]! << 8) | bytes[m + 2]!
    if (comprimento < 2) return null
    const fimDoSegmento = m + 1 + comprimento
    if (fimDoSegmento > fim) return null

    const nome = nomeDoSegmentoJpeg(marcador, bytes, m + 3, fimDoSegmento)
    if (nome !== null && deveRemoverSegmentoJpeg(marcador, bytes, m + 3, politica)) {
      removidos.push(nome)
    } else {
      partes.push(bytes.subarray(pos, fimDoSegmento))
    }
    pos = fimDoSegmento
  }

  return { bytes: juntar(partes), removidos }
}

/** Nome legivel de um segmento que possa transportar metadados, ou null. */
function nomeDoSegmentoJpeg(
  marcador: number,
  bytes: Uint8Array,
  payload: number,
  fimDoSegmento: number,
): string | null {
  switch (marcador) {
    case 0xe1: {
      // APP1 e EXIF ou XMP, conforme o identificador.
      const identificador = texto(bytes, payload, Math.min(4, fimDoSegmento - payload))
      return identificador === 'Exif' ? 'EXIF' : 'XMP'
    }
    case 0xe2:
      return 'ICC'
    case 0xed:
      return 'IPTC'
    case 0xfe:
      return 'COM'
    default:
      return null
  }
}

function deveRemoverSegmentoJpeg(
  marcador: number,
  bytes: Uint8Array,
  payload: number,
  politica: MetadataPolicy,
): boolean {
  // APP1 (EXIF e XMP), APP13 (IPTC e 8BIM) e o comentario saem sempre: nenhum
  // deles descreve cor, e todos podem identificar pessoa, equipamento ou
  // local. Ver o comentario de MetadataPolicy em features/converter/types.
  if (marcador === 0xe1 || marcador === 0xed || marcador === 0xfe) return true

  // APP2 so sai em 'remover', e so quando e mesmo o perfil ICC: em
  // 'preservar-cor' o perfil fica, para a imagem nao mudar de aspeto.
  if (marcador === 0xe2) {
    return politica === 'remover' && texto(bytes, payload, 11) === 'ICC_PROFILE'
  }

  return false
}

const PNG_ASSINATURA = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const

/** Blocos de PNG que transportam metadados e nao descrevem cor. */
const PNG_A_REMOVER: readonly string[] = ['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']

/**
 * PNG: assinatura de 8 bytes e depois blocos
 * `comprimento(4) tipo(4) dados(n) crc(4)`.
 *
 * Os blocos ficam intactos, portanto os CRC continuam validos e nao ha nada
 * a recalcular.
 */
function limparPng(bytes: Uint8Array<ArrayBuffer>, politica: MetadataPolicy): LimpezaDeMetadados | null {
  const fim = bytes.byteLength
  if (fim < 8) return null
  for (const [i, esperado] of PNG_ASSINATURA.entries()) {
    if (bytes[i] !== esperado) return null
  }

  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const partes: Uint8Array<ArrayBuffer>[] = [bytes.subarray(0, 8)]
  const removidos: string[] = []
  let pos = 8

  while (pos + 12 <= fim) {
    const comprimento = vista.getUint32(pos)
    const tipo = texto(bytes, pos + 4, 4)
    const fimDoBloco = pos + 12 + comprimento
    if (fimDoBloco > fim) return null

    const remover =
      PNG_A_REMOVER.includes(tipo) || (tipo === 'iCCP' && politica === 'remover')

    if (remover) removidos.push(tipo)
    else partes.push(bytes.subarray(pos, fimDoBloco))

    pos = fimDoBloco
    if (tipo === 'IEND') break
  }

  return { bytes: juntar(partes), removidos }
}

/** Bits do byte de flags do VP8X que declaram cada bloco opcional. */
const VP8X_FLAG = { ICCP: 0x20, EXIF: 0x08, 'XMP ': 0x04 } as const

/**
 * WebP: contentor RIFF, com blocos `fourcc(4) tamanho(4) dados(n)` e um byte
 * de preenchimento quando o tamanho e impar.
 *
 * Alem de retirar os blocos, ha duas contas a corrigir: o tamanho declarado
 * no cabecalho RIFF e os bits do VP8X que anunciam quais dos blocos opcionais
 * existem. Um VP8X a dizer que ha EXIF num ficheiro sem EXIF e um ficheiro
 * mal formado.
 */
function limparWebp(bytes: Uint8Array<ArrayBuffer>, politica: MetadataPolicy): LimpezaDeMetadados | null {
  const fim = bytes.byteLength
  if (fim < 12) return null
  if (texto(bytes, 0, 4) !== 'RIFF' || texto(bytes, 8, 4) !== 'WEBP') return null

  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const mantidos: Uint8Array<ArrayBuffer>[] = []
  const removidos: string[] = []
  let pos = 12

  while (pos + 8 <= fim) {
    const fourcc = texto(bytes, pos, 4)
    const tamanho = vista.getUint32(pos + 4, true)
    const fimDosDados = pos + 8 + tamanho
    if (fimDosDados > fim) return null
    // O byte de preenchimento pertence ao fluxo mas nao conta no tamanho.
    const fimDoBloco = Math.min(fimDosDados + (tamanho % 2), fim)

    const remover =
      fourcc === 'EXIF' || fourcc === 'XMP ' || (fourcc === 'ICCP' && politica === 'remover')

    if (remover) removidos.push(fourcc)
    else mantidos.push(bytes.subarray(pos, fimDoBloco))

    pos = fimDoBloco
  }

  if (removidos.length === 0) return { bytes, removidos }

  const corpo = juntar(mantidos)
  const saida = new Uint8Array(12 + corpo.byteLength)
  saida.set(bytes.subarray(0, 12))
  saida.set(corpo, 12)
  // O tamanho RIFF conta tudo a partir do campo 'WEBP', inclusive.
  new DataView(saida.buffer).setUint32(4, saida.byteLength - 8, true)

  // O VP8X, quando existe, e sempre o primeiro bloco depois do cabecalho.
  if (saida.byteLength >= 21 && texto(saida, 12, 4) === 'VP8X') {
    let flags = saida[20]!
    for (const fourcc of removidos) {
      const bit = VP8X_FLAG[fourcc as keyof typeof VP8X_FLAG]
      if (bit !== undefined) flags &= ~bit
    }
    saida[20] = flags
  }

  return { bytes: saida, removidos }
}
