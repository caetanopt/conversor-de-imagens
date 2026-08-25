// @vitest-environment node
/**
 * Ficheiros de marca fornecidos diretamente, fora do manual.
 *
 * Dois ficheiros diferentes de qualquer outro ativo de marca neste projeto:
 * nao vem de paginas do PDF nem sao gerados por um script a partir de um
 * ficheiro fonte auditavel. Chegaram prontos. O que resta verificar e mais
 * simples: que o ficheiro servido e exatamente o que foi entregue, e que o
 * fundo nao voltou a crescer sem ninguem reparar.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('favicon', () => {
  const FONTE = resolve(process.cwd(), 'docs/brand/cropped-logo-caetano-32x32.png')
  const SERVIDO = resolve(process.cwd(), 'src/app/icon.png')

  it('o ficheiro servido e identico, byte a byte, ao fornecido em docs/brand', () => {
    // Nao redesenhado nem recomprimido: e o ficheiro entregue, tal como veio.
    expect(existsSync(FONTE), `fonte nao encontrada em ${FONTE}`).toBe(true)
    expect(existsSync(SERVIDO), `icone nao encontrado em ${SERVIDO}`).toBe(true)
    expect(readFileSync(SERVIDO).equals(readFileSync(FONTE))).toBe(true)
  })

  it('e um PNG valido', () => {
    const bytes = readFileSync(SERVIDO)
    const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(bytes.subarray(0, 8).equals(ASSINATURA_PNG)).toBe(true)
  })
})

describe('fundo da zona de largar', () => {
  const FICHEIRO = resolve(process.cwd(), 'public/marca/fundo-caetano.webp')
  // Uma fotografia real nao comprime como o campo de cor liso que este
  // ficheiro tinha antes. 180 kB da margem sobre os ~100 kB atuais sem deixar
  // passar um regresso a resolucao ou qualidade da fonte sem redimensionar.
  const LIMITE_DE_BYTES = 180 * 1024

  it('existe e cabe no orcamento de bytes', () => {
    expect(existsSync(FICHEIRO), `gerar com: node scripts/gerar-fundo-marca.mjs`).toBe(true)
    const bytes = statSync(FICHEIRO).size
    expect(bytes).toBeGreaterThan(0)
    expect(
      bytes,
      `${bytes} bytes, limite ${LIMITE_DE_BYTES}. Regenerar com node scripts/gerar-fundo-marca.mjs`,
    ).toBeLessThanOrEqual(LIMITE_DE_BYTES)
  })
})
