import { describe, expect, it } from 'vitest'

import {
  FORMATOS,
  acceptDeEntrada,
  formatoPorExtensao,
  formatoPorId,
  formatoPorMagickFormat,
  formatoPorMime,
  formatosDeEntrada,
  formatosDeSaida,
} from '@/config/formats'

describe('registry de formatos', () => {
  it('nao tem ids repetidos', () => {
    const ids = FORMATOS.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('nao tem extensoes partilhadas entre formatos diferentes', () => {
    const vistas = new Map<string, string>()
    for (const formato of FORMATOS) {
      for (const ext of formato.extensions) {
        const anterior = vistas.get(ext)
        expect(anterior, `extensao ${ext} em ${formato.id} e ${anterior}`).toBeUndefined()
        vistas.set(ext, formato.id)
      }
    }
  })

  it('so expoe como saida formatos ativos que o motor sabe escrever', () => {
    for (const formato of formatosDeSaida()) {
      expect(formato.release).toBe('ativo')
      expect(formato.canEncode).toBe(true)
    }
  })

  it('a saida ativa e JPG, PNG, WebP, AVIF, GIF e BMP', () => {
    // Ordem do registry, nao alfabetica. Mudar isto e uma decisao de produto e
    // nao um detalhe: cada formato aqui exige fixture e validacao.
    expect(formatosDeSaida().map((f) => f.id)).toEqual([
      'jpeg',
      'png',
      'webp',
      'avif',
      'gif',
      'bmp',
    ])
  })

  it('supportsAnimation e multiFrame nao podem divergir', () => {
    // Dois campos sobre a mesma realidade. O motor decide o que preservar por
    // multiFrame, e a interface fala de animacao por supportsAnimation: se um
    // deles for editado sem o outro, o produto passa a mentir num dos lados.
    for (const formato of FORMATOS) {
      expect(formato.supportsAnimation, formato.id).toBe(formato.multiFrame === 'animacao')
    }
  })

  it('cada valor de multiFrame descreve o que o formato realmente guarda', () => {
    expect(formatoPorId('gif').multiFrame).toBe('animacao')
    expect(formatoPorId('webp').multiFrame).toBe('animacao')
    // Um ICO guarda o mesmo icone em varias dimensoes, nao uma sequencia.
    expect(formatoPorId('ico').multiFrame).toBe('tamanhos')
    // Um TIFF guarda paginas de um documento.
    expect(formatoPorId('tiff').multiFrame).toBe('paginas')
    expect(formatoPorId('jpeg').multiFrame).toBe('nenhum')
    expect(formatoPorId('bmp').multiFrame).toBe('nenhum')
  })

  it('nunca expoe HEIC como saida, porque o motor nao o escreve', () => {
    expect(formatoPorId('heic').canEncode).toBe(false)
    expect(formatosDeSaida().some((f) => f.id === 'heic')).toBe(false)
  })

  it('so aceita como entrada formatos ativos que o motor sabe ler', () => {
    for (const formato of formatosDeEntrada()) {
      expect(formato.release).toBe('ativo')
      expect(formato.canDecode).toBe(true)
    }
  })

  describe('aliases', () => {
    it('trata jpg, jpeg e jfif como o mesmo formato', () => {
      expect(formatoPorExtensao('foto.jpg')?.id).toBe('jpeg')
      expect(formatoPorExtensao('foto.jpeg')?.id).toBe('jpeg')
      expect(formatoPorExtensao('foto.jfif')?.id).toBe('jpeg')
    })

    it('trata tif como tiff', () => {
      expect(formatoPorExtensao('scan.tif')?.id).toBe('tiff')
      expect(formatoPorExtensao('scan.tiff')?.id).toBe('tiff')
    })

    it('nunca envia JFIF ao motor como formato proprio', () => {
      // MagickFormat.Jfif escreve bytes PNG. Verificado com magic bytes
      // 89 50 4e 47 na prova tecnica. Este teste protege contra a regressao
      // de alguem passar a extensao como formato.
      expect(formatoPorId('jpeg').magickFormat).toBe('JPEG')
      expect(formatoPorId('jpeg').magickFormat).not.toBe('JFIF')
    })

    it('resolve o nome cru do motor de volta para o formato do dominio', () => {
      expect(formatoPorMagickFormat('JPEG')?.id).toBe('jpeg')
      expect(formatoPorMagickFormat('webp')?.id).toBe('webp')
      expect(formatoPorMagickFormat('NAO_EXISTE')).toBeNull()
    })
  })

  describe('coerencia de capacidades', () => {
    it('formatos com qualidade tem qualidade por defeito, e vice-versa', () => {
      for (const formato of FORMATOS) {
        if (formato.supportsQuality) {
          expect(formato.defaultQuality, formato.id).not.toBeNull()
        } else {
          expect(formato.defaultQuality, formato.id).toBeNull()
        }
      }
    })

    it('PNG nao tem qualidade com perda', () => {
      expect(formatoPorId('png').supportsQuality).toBe(false)
      expect(formatoPorId('png').supportsLossless).toBe(true)
    })

    it('todos os formatos tem pelo menos uma extensao e um mime', () => {
      for (const formato of FORMATOS) {
        expect(formato.extensions.length, formato.id).toBeGreaterThan(0)
        expect(formato.mimeTypes.length, formato.id).toBeGreaterThan(0)
      }
    })
  })

  it('formatoPorMime ignora maiusculas e espacos', () => {
    expect(formatoPorMime(' IMAGE/JPEG ')?.id).toBe('jpeg')
  })

  it('formatoPorId falha alto para um id desconhecido', () => {
    // @ts-expect-error id invalido de proposito
    expect(() => formatoPorId('nao-existe')).toThrow()
  })

  it('o accept do input cobre mimes e extensoes dos formatos ativos', () => {
    const accept = acceptDeEntrada()
    expect(accept).toContain('image/jpeg')
    expect(accept).toContain('.webp')
    expect(accept).toContain('image/avif')
    // Um formato inativo nao deve aparecer no seletor de ficheiros.
    expect(accept).not.toContain('image/tiff')
    expect(accept).not.toContain('image/heic')
  })
})
