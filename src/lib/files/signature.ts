/**
 * Deteccao de formato por assinatura real do ficheiro.
 *
 * A extensao e o MIME do browser sao dicas, nao factos: qualquer um pode
 * renomear um ficheiro. Um ficheiro do utilizador e input nao confiavel mesmo
 * sem servidor, porque vai ser entregue a um descodificador nativo.
 * CLAUDE.md, seccao 18.
 */
import { formatoPorId, type FormatId } from '@/config/formats'

/**
 * Nesta versao do TypeScript, Uint8Array e generico sobre o tipo de buffer.
 * Aceitamos a forma mais permissiva para os chamadores nao terem de saber se o
 * buffer veio de um File, de um worker ou de um teste.
 */
type Bytes = Uint8Array<ArrayBufferLike>

type Assinatura = {
  readonly id: FormatId
  /** Null numa posicao significa "qualquer byte". */
  readonly bytes: readonly (number | null)[]
  readonly offset: number
}

const ASSINATURAS: readonly Assinatura[] = [
  { id: 'jpeg', offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { id: 'png', offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { id: 'gif', offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] },
  { id: 'bmp', offset: 0, bytes: [0x42, 0x4d] },
  { id: 'tiff', offset: 0, bytes: [0x49, 0x49, 0x2a, 0x00] },
  { id: 'tiff', offset: 0, bytes: [0x4d, 0x4d, 0x00, 0x2a] },
  { id: 'ico', offset: 0, bytes: [0x00, 0x00, 0x01, 0x00] },
  { id: 'jxl', offset: 0, bytes: [0xff, 0x0a] },
  { id: 'jxl', offset: 0, bytes: [0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20] },
]

/** RIFF....WEBP: o tamanho fica entre os dois marcadores, logo o meio e ignorado. */
const WEBP = { riff: [0x52, 0x49, 0x46, 0x46], webp: [0x57, 0x45, 0x42, 0x50] } as const

/** ftyp em offset 4, com a marca do brand em offset 8. */
const CAIXAS_ISOBMFF: readonly { readonly marca: string; readonly id: FormatId }[] = [
  { marca: 'avif', id: 'avif' },
  { marca: 'avis', id: 'avif' },
  { marca: 'heic', id: 'heic' },
  { marca: 'heix', id: 'heic' },
  { marca: 'heim', id: 'heic' },
  { marca: 'heis', id: 'heic' },
  { marca: 'hevc', id: 'heic' },
  { marca: 'mif1', id: 'heic' },
  { marca: 'msf1', id: 'heic' },
]

function corresponde(dados: Bytes, assinatura: Assinatura): boolean {
  if (dados.length < assinatura.offset + assinatura.bytes.length) return false
  return assinatura.bytes.every((esperado, i) => {
    if (esperado === null) return true
    return dados[assinatura.offset + i] === esperado
  })
}

function texto(dados: Bytes, offset: number, comprimento: number): string {
  return Array.from(dados.slice(offset, offset + comprimento))
    .map((b) => String.fromCharCode(b))
    .join('')
}

/**
 * Devolve o formato detetado pelos bytes, ou null se nenhuma assinatura
 * conhecida corresponder. Null nao significa ficheiro invalido, significa que
 * nao o reconhecemos e por isso nao o aceitamos.
 */
export function detetarFormatoPorAssinatura(dados: Bytes): FormatId | null {
  if (corresponde(dados, { id: 'webp', offset: 0, bytes: WEBP.riff }) &&
      texto(dados, 8, 4) === 'WEBP') {
    return 'webp'
  }

  if (texto(dados, 4, 4) === 'ftyp') {
    const marca = texto(dados, 8, 4).toLowerCase()
    const caixa = CAIXAS_ISOBMFF.find((c) => c.marca === marca)
    if (caixa) return caixa.id
  }

  for (const assinatura of ASSINATURAS) {
    if (corresponde(dados, assinatura)) return assinatura.id
  }

  return null
}

/** Nome legivel do formato detetado, para mensagens de erro. */
export function etiquetaDoFormato(id: FormatId | null): string {
  return id ? formatoPorId(id).label : 'desconhecido'
}
