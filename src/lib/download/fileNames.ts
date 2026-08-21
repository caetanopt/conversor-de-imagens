/**
 * Nomes dos ficheiros de saida.
 *
 * Preserva o nome original e troca apenas a extensao.
 * CLAUDE.md, seccao 22.
 */
import { formatoPorId, type FormatId } from '@/config/formats'

export function trocarExtensao(nomeOriginal: string, formatId: FormatId): string {
  const formato = formatoPorId(formatId)
  const extensao = formato.extensions[0]
  const base = removerExtensao(nomeOriginal)
  return `${base || 'imagem'}.${extensao}`
}

export function removerExtensao(nome: string): string {
  const ponto = nome.lastIndexOf('.')
  // Um ponto na posicao 0 e um ficheiro oculto, nao uma extensao.
  if (ponto <= 0) return nome
  return nome.slice(0, ponto)
}

/**
 * Resolve colisoes com um sufixo previsivel. Usado no ZIP quando dois
 * ficheiros de origem diferentes produzem o mesmo nome de saida.
 */
export function nomeUnico(nome: string, jaUsados: ReadonlySet<string>): string {
  if (!jaUsados.has(nome)) return nome

  const base = removerExtensao(nome)
  const extensao = nome.slice(base.length)
  let contador = 2
  let candidato = `${base}-${contador}${extensao}`
  while (jaUsados.has(candidato)) {
    contador += 1
    candidato = `${base}-${contador}${extensao}`
  }
  return candidato
}
