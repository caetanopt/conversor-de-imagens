import { describe, expect, it } from 'vitest'

import { LIMITES } from '@/config/limits'
import type { ImageInspection } from '@/features/converter/types'
import { validarFicheiro, validarInspecao } from '@/lib/validation/validateFile'

const CABECALHO_JPEG = new Uint8Array(32)
CABECALHO_JPEG.set([0xff, 0xd8, 0xff, 0xe0])

const CABECALHO_PNG = new Uint8Array(32)
CABECALHO_PNG.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const CABECALHO_TIFF = new Uint8Array(32)
CABECALHO_TIFF.set([0x49, 0x49, 0x2a, 0x00])

function ficheiroFalso(tamanho: number, nome = 'foto.jpg', tipo = 'image/jpeg'): File {
  const file = new File([], nome, { type: tipo })
  // Evita alocar 100 MB reais so para testar o limite de tamanho.
  Object.defineProperty(file, 'size', { value: tamanho })
  return file
}

function inspecao(parcial: Partial<ImageInspection> = {}): ImageInspection {
  return {
    formatId: 'jpeg',
    magickFormat: 'JPEG',
    width: 1200,
    height: 800,
    frameCount: 1,
    hasAlpha: false,
    ...parcial,
  }
}

describe('validarFicheiro', () => {
  it('aceita um JPEG valido', () => {
    const r = validarFicheiro(ficheiroFalso(2048), CABECALHO_JPEG)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.formatId).toBe('jpeg')
  })

  it('rejeita ficheiro vazio', () => {
    const r = validarFicheiro(ficheiroFalso(0), CABECALHO_JPEG)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('ficheiro-invalido')
  })

  it('rejeita acima do limite de tamanho', () => {
    const r = validarFicheiro(ficheiroFalso(LIMITES.maxBytesPorFicheiro + 1), CABECALHO_JPEG)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.kind).toBe('demasiado-grande')
      // A mensagem tem de dizer o limite, senao o utilizador nao sabe o que fazer.
      expect(r.error.message).toContain('100')
    }
  })

  it('rejeita conteudo que nao reconhece, mesmo com extensao de imagem', () => {
    const lixo = new Uint8Array(32)
    lixo.set([0x50, 0x4b, 0x03, 0x04]) // ZIP
    const r = validarFicheiro(ficheiroFalso(2048, 'disfarce.jpg'), lixo)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('formato-nao-suportado')
  })

  it('rejeita um formato reconhecido mas ainda nao ativo', () => {
    const r = validarFicheiro(ficheiroFalso(2048, 'scan.tif', 'image/tiff'), CABECALHO_TIFF)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.kind).toBe('formato-nao-suportado')
      expect(r.error.message).toContain('TIFF')
    }
  })

  it('avisa quando o MIME declarado nao corresponde ao conteudo', () => {
    // Um PNG renomeado para .jpg: aceitamos, mas dizemos o que vamos fazer.
    const r = validarFicheiro(ficheiroFalso(2048, 'mentira.jpg', 'image/jpeg'), CABECALHO_PNG)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.formatId).toBe('png')
      expect(r.warnings).toHaveLength(1)
      expect(r.warnings[0]).toContain('PNG')
    }
  })

  it('nao avisa quando o MIME esta vazio', () => {
    const r = validarFicheiro(ficheiroFalso(2048, 'foto.jpg', ''), CABECALHO_JPEG)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.warnings).toHaveLength(0)
  })
})

describe('validarInspecao', () => {
  it('aceita dimensoes normais sem avisos', () => {
    const r = validarInspecao(inspecao())
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.warnings).toHaveLength(0)
  })

  it('rejeita dimensoes invalidas', () => {
    const r = validarInspecao(inspecao({ width: 0, height: 0 }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('ficheiro-invalido')
  })

  it('rejeita acima do limite de pixels e explica a razao', () => {
    // O limite e 40 MP, medido: 100 MP mata o worker e 60 MP levou 82 s.
    const r = validarInspecao(inspecao({ width: 20_000, height: 20_000 }))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.kind).toBe('demasiado-grande')
      expect(r.error.message).toContain('40 MP')
      expect(r.error.message).toMatch(/tempo útil/)
    }
  })

  it('aceita exatamente no limite', () => {
    // 40 MP redondos tem de passar. Uma imagem de camara de topo cai aqui.
    const r = validarInspecao(inspecao({ width: 8000, height: 5000 }))
    expect(r.ok).toBe(true)
  })

  it('avisa em segundos entre 12 e 24 MP', () => {
    // Medido: 4,6 s a 12 MP.
    const r = validarInspecao(inspecao({ width: 5000, height: 3000 }))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.warnings).toHaveLength(1)
      expect(r.warnings[0]).toContain('alguns segundos')
    }
  })

  it('avisa de demora longa acima de 24 MP', () => {
    // Medido: 53 s a 40 MP. "Alguns segundos" seria enganador.
    const r = validarInspecao(inspecao({ width: 7000, height: 4500 }))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.warnings).toHaveLength(1)
      expect(r.warnings[0]).toContain('mais de um minuto')
    }
  })

  it('nao avisa abaixo do primeiro patamar', () => {
    const r = validarInspecao(inspecao({ width: 2000, height: 1500 }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.warnings).toHaveLength(0)
  })

  /*
   * Os fotogramas multiplicam o trabalho: cada um e uma imagem a codificar.
   * O que acontece a animacao em si nao se decide aqui, porque depende do
   * formato de destino, que muda depois de o ficheiro entrar. Essa parte esta
   * em tests/unit/frames.test.ts.
   */
  it('conta os fotogramas no trabalho total', () => {
    // 12 fotogramas de 2000x1500 sao 36 MP a converter, e um unico frame
    // dessas dimensoes seriam 3 MP, que nao avisaria nada.
    const um = validarInspecao(inspecao({ width: 2000, height: 1500 }))
    const doze = validarInspecao(inspecao({ width: 2000, height: 1500, frameCount: 12 }))

    expect(um.ok && um.warnings).toHaveLength(0)
    expect(doze.ok).toBe(true)
    if (doze.ok) {
      expect(doze.warnings.some((a) => a.includes('12 fotogramas'))).toBe(true)
      expect(doze.warnings.some((a) => a.includes('mais de um minuto'))).toBe(true)
    }
  })

  it('recusa quando o total dos fotogramas passa o limite', () => {
    // 30 fotogramas de 1920x1080 sao 62 MP. Cada frame passa, o total nao.
    const r = validarInspecao(inspecao({ width: 1920, height: 1080, frameCount: 30 }))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.kind).toBe('demasiado-grande')
      expect(r.error.message).toContain('30 fotogramas')
      expect(r.error.message).toContain('40 MP')
    }
  })

  it('recusa pela area de um frame mesmo com um fotograma so', () => {
    const r = validarInspecao(inspecao({ width: 9000, height: 6000 }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toMatch(/tempo útil/)
  })
})
