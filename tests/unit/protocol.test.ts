import { describe, expect, it } from 'vitest'

import { classificarErroDoMotor } from '@/lib/image-engine/protocol'

describe('classificarErroDoMotor', () => {
  it('traduz falta de descodificador', () => {
    const r = classificarErroDoMotor('NoDecodeDelegateForThisImageFormat `/tmp/x.psd`')
    expect(r.kind).toBe('formato-nao-suportado')
    // A mensagem nao pode ser o nome da excecao do ImageMagick.
    expect(r.message).not.toContain('NoDecode')
    expect(r.message).toContain('suportado')
  })

  it('traduz falta de codificador', () => {
    expect(classificarErroDoMotor('NoEncodeDelegateForThisImageFormat').kind).toBe(
      'formato-nao-suportado',
    )
  })

  it('traduz ficheiro danificado', () => {
    expect(classificarErroDoMotor('CorruptImageError').kind).toBe('ficheiro-invalido')
    expect(classificarErroDoMotor('ImproperImageHeader').kind).toBe('ficheiro-invalido')
    expect(classificarErroDoMotor('UnexpectedEndOfFile').kind).toBe('ficheiro-invalido')
  })

  it('traduz falta de memoria e sugere o que fazer', () => {
    const r = classificarErroDoMotor('unable to allocate memory')
    expect(r.kind).toBe('sem-memoria')
    expect(r.message).toContain('pixels')
  })

  it('tem um caso por omissao em vez de deixar o utilizador sem mensagem', () => {
    const r = classificarErroDoMotor('algo completamente inesperado')
    expect(r.kind).toBe('falha-de-conversao')
    expect(r.message.length).toBeGreaterThan(0)
  })

  it('e insensivel a maiusculas', () => {
    expect(classificarErroDoMotor('NODECODEDELEGATE').kind).toBe('formato-nao-suportado')
  })
})
