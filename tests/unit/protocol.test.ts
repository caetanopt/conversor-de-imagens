import { describe, expect, it } from 'vitest'

import { classificarErroDoMotor } from '@/lib/image-engine/protocol'

/**
 * Mensagens reais observadas com as fixtures de teste, em vez de exemplos
 * inventados. Cada uma veio de um ficheiro concreto em tests/fixtures.
 */
const MENSAGENS_REAIS = {
  naoImagem: "NoDecodeDelegateForThisImageFormat `' @ error/blob.c/ImagesToBlob/2477",
  corrompido: "Unsupported marker type 0x24 `' @ error/jpeg.c/JPEGErrorHandler/350",
  minusculo: "InsufficientImageDataInFile `' @ error/jpeg.c/ReadJPEGImage/1082",
  vazio: 'The specified array cannot be empty',
  semEncoder: "NoEncodeDelegateForThisImageFormat `JFIF' @ error/blob.c/ImagesToBlob/2477",
} as const

describe('classificarErroDoMotor', () => {
  describe('mensagens reais das fixtures', () => {
    it('um ficheiro que nao e imagem da formato nao suportado', () => {
      expect(classificarErroDoMotor(MENSAGENS_REAIS.naoImagem).kind).toBe('formato-nao-suportado')
    })

    it('um JPEG com o corpo danificado da ficheiro invalido', () => {
      const r = classificarErroDoMotor(MENSAGENS_REAIS.corrompido)
      expect(r.kind).toBe('ficheiro-invalido')
      expect(r.message).toMatch(/danificado|incompleto/)
    })

    it('um ficheiro demasiado curto da ficheiro invalido', () => {
      expect(classificarErroDoMotor(MENSAGENS_REAIS.minusculo).kind).toBe('ficheiro-invalido')
    })

    it('um ficheiro vazio da ficheiro invalido', () => {
      expect(classificarErroDoMotor(MENSAGENS_REAIS.vazio).kind).toBe('ficheiro-invalido')
    })

    it('falta de encoder da formato nao suportado', () => {
      expect(classificarErroDoMotor(MENSAGENS_REAIS.semEncoder).kind).toBe('formato-nao-suportado')
    })
  })

  describe('outras familias de falha', () => {
    it('traduz falta de memoria', () => {
      const r = classificarErroDoMotor('unable to allocate memory')
      expect(r.kind).toBe('sem-memoria')
      expect(r.suggestion).toContain('pixels')
    })

    it('reconhece um limite de memoria do WASM', () => {
      expect(classificarErroDoMotor('memory access out of bounds').kind).toBe('sem-memoria')
      expect(classificarErroDoMotor('table index is out of range').kind).toBe('sem-memoria')
    })

    it('reconhece um motor interrompido', () => {
      expect(classificarErroDoMotor('Motor nao inicializado').kind).toBe('motor-terminado')
      expect(classificarErroDoMotor('RuntimeError: Aborted()').kind).toBe('motor-terminado')
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

  /**
   * O requisito e explicito: nao expor stack traces nem mensagens internas da
   * biblioteca. Estes testes verificam-no sobre as mensagens reais, e nao sobre
   * exemplos escolhidos para passarem.
   */
  describe('nenhuma mensagem tecnica chega ao utilizador', () => {
    const VESTIGIOS = [
      /NoDecodeDelegate/i,
      /NoEncodeDelegate/i,
      /InsufficientImageData/i,
      /error\//,
      /\.c\//,
      /@/,
      /0x[0-9a-f]+/i,
      /RuntimeError/i,
      /Aborted/i,
      /\bmarker\b/i,
      /\bwasm\b/i,
      /ImageMagick/i,
      /magick/i,
    ]

    for (const [nome, bruto] of Object.entries(MENSAGENS_REAIS)) {
      it(`a mensagem para ${nome} nao contem vestigios da biblioteca`, () => {
        const { message, suggestion } = classificarErroDoMotor(bruto)
        for (const vestigio of VESTIGIOS) {
          expect(message, `message: ${message}`).not.toMatch(vestigio)
          if (suggestion) expect(suggestion, `suggestion: ${suggestion}`).not.toMatch(vestigio)
        }
      })
    }

    it('nunca devolve a mensagem original', () => {
      for (const bruto of Object.values(MENSAGENS_REAIS)) {
        expect(classificarErroDoMotor(bruto).message).not.toBe(bruto)
      }
    })

    it('todas as mensagens estao em portugues e terminam em ponto', () => {
      for (const bruto of Object.values(MENSAGENS_REAIS)) {
        const { message } = classificarErroDoMotor(bruto)
        expect(message).toMatch(/\.$/)
        expect(message).not.toMatch(/^[a-z]/)
      }
    })
  })
})
