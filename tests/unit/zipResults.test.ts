// @vitest-environment node
/**
 * ZIP local.
 *
 * Ambiente node de proposito: o `Blob` do jsdom nao implementa
 * `arrayBuffer()`, que os browsers alvo suportam desde 2020 (Chrome 76,
 * Firefox 69, Safari 14). O modulo nao toca no DOM, portanto o ambiente node
 * testa o comportamento real em vez de um `Blob` incompleto.
 *
 * O que importa verificar nao e que a biblioteca funciona, e que o ficheiro
 * que sai daqui abre e traz os bytes certos com os nomes certos. Por isso o
 * teste volta a abrir o ZIP em vez de olhar para o tamanho.
 */
import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { criarZip, nomeDoZip, resolverNomes } from '@/lib/download/zipResults'

function blob(texto: string): Blob {
  return new Blob([new TextEncoder().encode(texto)])
}

async function abrir(zip: Blob): Promise<Record<string, string>> {
  const bytes = new Uint8Array(await zip.arrayBuffer())
  const entradas = unzipSync(bytes)
  const descodificador = new TextDecoder()
  return Object.fromEntries(
    Object.entries(entradas).map(([nome, dados]) => [nome, descodificador.decode(dados)]),
  )
}

describe('resolverNomes', () => {
  it('deixa nomes distintos como estao', () => {
    expect(resolverNomes([{ nome: 'a.webp' }, { nome: 'b.webp' }])).toEqual(['a.webp', 'b.webp'])
  })

  it('resolve colisoes com um sufixo previsivel', () => {
    // Acontece de verdade: foto.jpg e foto.png convertidos para WebP dao os
    // dois foto.webp.
    expect(resolverNomes([{ nome: 'foto.webp' }, { nome: 'foto.webp' }])).toEqual([
      'foto.webp',
      'foto-2.webp',
    ])
  })

  it('resolve colisoes repetidas sem voltar a colidir', () => {
    const nomes = resolverNomes([
      { nome: 'foto.webp' },
      { nome: 'foto.webp' },
      { nome: 'foto.webp' },
      { nome: 'foto-2.webp' },
    ])
    expect(new Set(nomes).size).toBe(nomes.length)
    expect(nomes[0]).toBe('foto.webp')
  })

  it('preserva a ordem de entrada', () => {
    const nomes = resolverNomes([{ nome: 'z.webp' }, { nome: 'a.webp' }])
    expect(nomes).toEqual(['z.webp', 'a.webp'])
  })
})

describe('criarZip', () => {
  it('produz um ZIP que abre com o conteudo certo', async () => {
    const { blob: zip, nomes } = await criarZip([
      { nome: 'um.webp', blob: blob('conteudo um') },
      { nome: 'dois.webp', blob: blob('conteudo dois') },
    ])

    expect(nomes).toEqual(['um.webp', 'dois.webp'])
    expect(zip.type).toBe('application/zip')
    expect(await abrir(zip)).toEqual({
      'um.webp': 'conteudo um',
      'dois.webp': 'conteudo dois',
    })
  })

  it('grava as duas entradas quando os nomes de origem colidem', async () => {
    const { blob: zip, nomes } = await criarZip([
      { nome: 'foto.webp', blob: blob('do jpg') },
      { nome: 'foto.webp', blob: blob('do png') },
    ])

    expect(nomes).toEqual(['foto.webp', 'foto-2.webp'])
    // Sem resolucao de nomes, a segunda entrada substituia a primeira e o
    // utilizador perdia um ficheiro sem aviso.
    expect(await abrir(zip)).toEqual({ 'foto.webp': 'do jpg', 'foto-2.webp': 'do png' })
  })

  it('preserva bytes binarios exatamente', async () => {
    const bytes = new Uint8Array([0, 255, 128, 1, 254, 0, 0, 77])
    const { blob: zip } = await criarZip([{ nome: 'b.bin', blob: new Blob([bytes]) }])

    const lidos = unzipSync(new Uint8Array(await zip.arrayBuffer()))['b.bin']
    expect(Array.from(lidos!)).toEqual(Array.from(bytes))
  })

  it('recusa uma lista vazia em vez de gerar um ZIP sem nada', async () => {
    await expect(criarZip([])).rejects.toThrow()
  })
})

describe('nomeDoZip', () => {
  it('distingue singular de plural', () => {
    expect(nomeDoZip(1)).toBe('imagem-convertida.zip')
    expect(nomeDoZip(4)).toBe('4-imagens-convertidas.zip')
  })

  it('nao inclui data nem hora', () => {
    // Um carimbo temporal no nome revelaria quando o utilizador processou as
    // imagens, que e o tipo de dado que a politica de metadados remove.
    // Determinismo e a forma de o provar.
    expect(nomeDoZip(3)).toBe(nomeDoZip(3))
    expect(nomeDoZip(3)).not.toMatch(/\d{4}/)
  })
})
