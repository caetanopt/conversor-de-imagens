/**
 * ZIP gerado localmente.
 *
 * A biblioteca e o `fflate`, sugerida pelo CLAUDE.md, seccao 22. Resolve um
 * problema concreto: produzir um ZIP valido no browser sem enviar nada para um
 * servico remoto. Sao 92 KB em ESM e usamos apenas a funcao `zip`, portanto o
 * que entra no bundle e uma fracao disso.
 *
 * Duas decisoes:
 *
 *  1. **Sem compressao.** Os ficheiros que vao dentro do ZIP ja sao JPEG, PNG,
 *     WebP ou AVIF, todos comprimidos. Voltar a comprimir gasta tempo e memoria
 *     para ganhar quase nada, e no caso de dados incompressiveis pode aumentar.
 *     `level: 0` guarda os bytes como estao.
 *
 *  2. **Nomes resolvidos antes de empacotar.** Dois ficheiros de origem
 *     diferentes podem produzir o mesmo nome de saida, por exemplo `foto.jpg` e
 *     `foto.png` a converter ambos para `foto.webp`. Um ZIP com nomes repetidos
 *     e ambiguo, por isso o segundo passa a `foto-2.webp`.
 */
import { zip, type Zippable } from 'fflate'

import { nomeUnico } from './fileNames'

export type EntradaDoZip = {
  readonly nome: string
  readonly blob: Blob
}

export type ResultadoDoZip = {
  readonly blob: Blob
  /** Nomes finais, na ordem de entrada, ja com colisoes resolvidas. */
  readonly nomes: readonly string[]
}

/**
 * Resolve colisoes de nome, preservando a ordem.
 * Exportada porque a interface precisa de mostrar os nomes finais antes de
 * o utilizador descarregar.
 */
export function resolverNomes(entradas: readonly { nome: string }[]): readonly string[] {
  const usados = new Set<string>()
  return entradas.map((entrada) => {
    const nome = nomeUnico(entrada.nome, usados)
    usados.add(nome)
    return nome
  })
}

export async function criarZip(entradas: readonly EntradaDoZip[]): Promise<ResultadoDoZip> {
  if (entradas.length === 0) throw new Error('Nao ha resultados para empacotar')

  const nomes = resolverNomes(entradas)

  const conteudo: Zippable = {}
  for (const [indice, entrada] of entradas.entries()) {
    const bytes = new Uint8Array(await entrada.blob.arrayBuffer())
    // O nome ja vem resolvido, portanto nunca sobrepoe uma entrada anterior.
    conteudo[nomes[indice]!] = [bytes, { level: 0 }]
  }

  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    zip(conteudo, { level: 0 }, (erro, dados) => {
      if (erro) reject(erro)
      else resolve(dados)
    })
  })

  return {
    blob: new Blob([bytes as unknown as BlobPart], { type: 'application/zip' }),
    nomes,
  }
}

/**
 * Nome do ZIP.
 *
 * Sem data nem hora: um nome com carimbo temporal revelaria quando o
 * utilizador processou as imagens, o que e exatamente o tipo de dado que a
 * politica de metadados remove dos ficheiros.
 */
export function nomeDoZip(quantidade: number): string {
  return quantidade === 1 ? 'imagem-convertida.zip' : `${quantidade}-imagens-convertidas.zip`
}
