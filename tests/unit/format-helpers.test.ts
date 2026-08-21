import { describe, expect, it } from 'vitest'

import { formatarBytes, formatarDimensoes, formatarDuracao, formatarMegapixels } from '@/lib/format/bytes'
import { compararTamanhos, formatarVariacao } from '@/lib/format/percent'

describe('formatarBytes', () => {
  it('usa virgula decimal e nomes em portugues', () => {
    expect(formatarBytes(0)).toBe('0 B')
    expect(formatarBytes(512)).toBe('512 B')
    expect(formatarBytes(1024)).toBe('1,00 KB')
    expect(formatarBytes(1536)).toBe('1,50 KB')
    expect(formatarBytes(1024 * 1024)).toBe('1,00 MB')
  })

  it('reduz decimais em valores maiores', () => {
    expect(formatarBytes(15 * 1024 * 1024)).toBe('15,0 MB')
  })

  it('nao explode com valores invalidos', () => {
    expect(formatarBytes(-1)).toBe('0 B')
    expect(formatarBytes(Number.NaN)).toBe('0 B')
  })
})

describe('formatarDimensoes e formatarMegapixels', () => {
  it('escreve dimensoes de forma legivel', () => {
    expect(formatarDimensoes(1920, 1080)).toBe('1920 x 1080')
  })

  it('converte para megapixels com uma decimal abaixo de 10', () => {
    expect(formatarMegapixels(1000, 1000)).toBe('1,0 MP')
    expect(formatarMegapixels(3000, 2000)).toBe('6,0 MP')
  })

  it('dispensa a decimal acima de 10 MP, onde nao acrescenta informacao', () => {
    expect(formatarMegapixels(4000, 3000)).toBe('12 MP')
    expect(formatarMegapixels(6000, 4000)).toBe('24 MP')
  })
})

describe('formatarDuracao', () => {
  it('usa ms abaixo de um segundo e s acima', () => {
    expect(formatarDuracao(420)).toBe('420 ms')
    expect(formatarDuracao(4100)).toBe('4,1 s')
  })
})

describe('compararTamanhos', () => {
  it('calcula uma reducao', () => {
    const c = compararTamanhos(1000, 400)
    expect(c.direction).toBe('reduziu')
    expect(c.savingPercent).toBeCloseTo(60)
    expect(c.deltaBytes).toBe(-600)
  })

  it('nao esconde um aumento', () => {
    const c = compararTamanhos(400, 1000)
    expect(c.direction).toBe('aumentou')
    expect(c.savingPercent).toBeCloseTo(-150)
    expect(formatarVariacao(c)).toBe('mais 150 %')
  })

  it('reconhece tamanho igual', () => {
    expect(compararTamanhos(500, 500).direction).toBe('igual')
    expect(formatarVariacao(compararTamanhos(500, 500))).toBe('sem alteração')
  })

  it('nao divide por zero', () => {
    expect(compararTamanhos(0, 100).savingPercent).toBe(0)
  })

  it('nao arredonda uma reducao minima para zero por cento', () => {
    // 0,05 % de reducao continua a ser uma reducao. Mostrar "menos 0 %"
    // pareceria um erro.
    const c = compararTamanhos(1_000_000, 999_500)
    expect(formatarVariacao(c)).toBe('menos 0,05 %')
  })
})
