// @vitest-environment node
/**
 * Contrato entre o registry de formatos e o motor real.
 *
 * Este teste arranca o binario WASM verdadeiro e verifica que cada formato
 * marcado como 'ativo' faz realmente o que a tabela diz. E o mecanismo que
 * sustenta a regra "um formato so pode aparecer na interface se existir
 * suporte real e testado" (CLAUDE.md, seccao 5.2).
 *
 * Se uma atualizacao do magick-wasm deixar cair um delegate ou mudar um
 * comportamento, isto falha antes de chegar a producao.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  ImageMagick,
  initializeImageMagick,
  Magick,
  MagickImage,
  MagickFormat,
  MagickReadSettings,
} from '@imagemagick/magick-wasm'

import { DELEGATES_ESPERADOS, PROFUNDIDADE_DE_CANAL } from '@/config/engine'
import { FORMATOS, formatoPorId, formatosDeSaida } from '@/config/formats'
import { detetarFormatoPorAssinatura } from '@/lib/files/signature'
import { resolveEncodeDirectives } from '@/lib/image-engine/options'
import { opcoesPorDefeito } from '@/features/converter/state/jobsReducer'

let fonte: Uint8Array

beforeAll(async () => {
  const wasm = readFileSync(resolve(process.cwd(), 'public/magick/magick.wasm'))
  await initializeImageMagick(new Uint8Array(wasm))

  // Imagem de referencia com gradiente, para a compressao com perda ter
  // conteudo real com que trabalhar.
  const settings = new MagickReadSettings()
  settings.width = 240
  settings.height = 160
  const seed = MagickImage.create()
  seed.read('gradient:red-blue', settings)
  fonte = seed.write('PNG' as MagickFormat, (d) => new Uint8Array(d))
  seed.dispose()
}, 60_000)

describe('capacidades do motor', () => {
  it('tem todos os delegates que a configuracao declara', () => {
    const presentes = Magick.delegates.split(/\s+/).filter(Boolean)
    for (const esperado of DELEGATES_ESPERADOS) {
      expect(presentes, `delegate ${esperado} em falta`).toContain(esperado)
    }
  })

  it('e uma build Q8, como a configuracao assume', () => {
    expect(Magick.imageMagickVersion).toContain(`Q${PROFUNDIDADE_DE_CANAL}`)
  })
})

describe('formatos ativos escrevem realmente o formato certo', () => {
  for (const formato of formatosDeSaida()) {
    it(`${formato.label} produz bytes reconhecidos como ${formato.id}`, () => {
      const diretivas = resolveEncodeDirectives(opcoesPorDefeito(formato.id))

      const saida = ImageMagick.read(fonte, (img) => {
        if (diretivas.quality !== null) img.quality = diretivas.quality
        return img.write(diretivas.magickFormat as MagickFormat, (d) => new Uint8Array(d))
      })

      expect(saida.length).toBeGreaterThan(0)
      // Fecha o ciclo: o que o motor escreveu e detetado pelo nosso detetor
      // de assinaturas como o formato que o registry prometeu.
      expect(detetarFormatoPorAssinatura(saida)).toBe(formato.id)
    })
  }

  it('todos os formatos ativos voltam a ser lidos pelo motor', () => {
    for (const formato of formatosDeSaida()) {
      // O ICO nao passa de 256 px, e a fonte tem 240x160, portanto cabe.
      const saida = ImageMagick.read(fonte, (img) =>
        img.write(formato.magickFormat as MagickFormat, (d) => new Uint8Array(d)),
      )

      // Alguns formatos nao se identificam pelos proprios bytes. O registry diz
      // quais, e a aplicacao passa o formato nesses casos.
      const settings = formato.requiresFormatHint
        ? new MagickReadSettings({ format: formato.magickFormat as MagickFormat })
        : undefined

      const dimensoes = settings
        ? ImageMagick.read(saida, settings, (img) => ({ w: img.width, h: img.height }))
        : ImageMagick.read(saida, (img) => ({ w: img.width, h: img.height }))

      expect(dimensoes, formato.id).toEqual({ w: 240, h: 160 })
    }
  })

  it('so o ICO precisa de formato explicito para ser lido', () => {
    // Se um formato novo passar a precisar de hint, ou o ICO deixar de precisar,
    // este teste falha e o registry tem de ser corrigido.
    for (const formato of FORMATOS) {
      const saida = formato.canEncode
        ? ImageMagick.read(fonte, (img) =>
            formato.id === 'heic'
              ? new Uint8Array()
              : img.write(formato.magickFormat as MagickFormat, (d) => new Uint8Array(d)),
          )
        : new Uint8Array()
      if (saida.length === 0) continue

      let leSemHint = true
      try {
        ImageMagick.read(saida, (img) => img.width)
      } catch {
        leSemHint = false
      }
      expect(leSemHint, `${formato.id} sem hint`).toBe(!formato.requiresFormatHint)
    }
  })
})

describe('armadilhas conhecidas do motor', () => {
  it('nao existe formato JFIF no motor, o que justifica ser apenas um alias', () => {
    // Verificado nesta versao: nao ha constante e nao ha encoder.
    expect('Jfif' in MagickFormat).toBe(false)
    expect(() =>
      ImageMagick.read(fonte, (img) => img.write('JFIF' as MagickFormat, (d) => d.length)),
    ).toThrow(/NoEncodeDelegate/)

    // O caminho da aplicacao para um ficheiro .jfif produz um JPEG de verdade.
    expect(formatoPorId('jpeg').magickFormat).toBe('JPEG')
    const pelaAplicacao = ImageMagick.read(fonte, (img) =>
      img.write(formatoPorId('jpeg').magickFormat as MagickFormat, (d) => new Uint8Array(d)),
    )
    expect(detetarFormatoPorAssinatura(pelaAplicacao)).toBe('jpeg')
  })

  it('um formato invalido grava em silencio no formato de origem', () => {
    // Esta e a armadilha que justifica a validacao no adapter. Passar undefined
    // a `write` nao lanca: devolve um ficheiro valido do formato ERRADO.
    const fonteEhPng = detetarFormatoPorAssinatura(fonte) === 'png'
    expect(fonteEhPng).toBe(true)

    const comFormatoInvalido = ImageMagick.read(fonte, (img) =>
      img.write(undefined as unknown as MagickFormat, (d) => new Uint8Array(d)),
    )
    // Pedimos outra coisa e recebemos PNG, sem erro nenhum.
    expect(detetarFormatoPorAssinatura(comFormatoInvalido)).toBe('png')
  })

  it('cada magickFormat do registry existe realmente no motor', () => {
    // Fecha a classe de bugs acima: se um valor do registry deixar de existir
    // no enum da biblioteca, falha aqui em vez de gravar o formato errado.
    const nomesDoMotor = new Set<string>(Object.values(MagickFormat))
    for (const formato of FORMATOS) {
      expect(nomesDoMotor.has(formato.magickFormat), `${formato.id} -> ${formato.magickFormat}`).toBe(
        true,
      )
    }
  })

  it('o motor aceita o define heic:speed que o AVIF exige', () => {
    const diretivas = resolveEncodeDirectives(opcoesPorDefeito('avif'))
    expect(diretivas.defines).toHaveLength(1)

    const saida = ImageMagick.read(fonte, (img) => {
      if (diretivas.quality !== null) img.quality = diretivas.quality
      for (const d of diretivas.defines) {
        img.settings.setDefine(d.format as MagickFormat, d.name, d.value)
      }
      return img.write('AVIF' as MagickFormat, (d) => new Uint8Array(d))
    })

    expect(detetarFormatoPorAssinatura(saida)).toBe('avif')
  })

  it('HEIC nao se consegue escrever, o que justifica ser so entrada', () => {
    expect(formatoPorId('heic').canEncode).toBe(false)
    expect(() =>
      ImageMagick.read(fonte, (img) => img.write('HEIC' as MagickFormat, (d) => d.length)),
    ).toThrow()
  })

  it('progressivo em JPEG exige img.settings.interlace e nao img.interlace', () => {
    // img.interlace e apenas leitura. Este teste documenta a razao pela qual
    // o adapter usa o objeto de settings.
    const tipoSof = (b: Uint8Array): string => {
      for (let i = 2; i < b.length - 1; i += 1) {
        if (b[i] === 0xff && (b[i + 1] === 0xc0 || b[i + 1] === 0xc2)) {
          return b[i + 1] === 0xc2 ? 'progressivo' : 'baseline'
        }
      }
      return 'desconhecido'
    }

    const baseline = ImageMagick.read(fonte, (img) =>
      img.write('JPEG' as MagickFormat, (d) => new Uint8Array(d)),
    )
    expect(tipoSof(baseline)).toBe('baseline')

    const progressivo = ImageMagick.read(fonte, (img) => {
      img.settings.interlace = 3 // Interlace.Plane
      return img.write('JPEG' as MagickFormat, (d) => new Uint8Array(d))
    })
    expect(tipoSof(progressivo)).toBe('progressivo')
  })
})

describe('formatos ainda escondidos', () => {
  it('cada formato em avaliacao declara capacidades que o motor confirma', () => {
    const emAvaliacao = FORMATOS.filter((f) => f.release === 'em-avaliacao' && f.canEncode)
    expect(emAvaliacao.length).toBeGreaterThan(0)

    for (const formato of emAvaliacao) {
      const diretivas = resolveEncodeDirectives(opcoesPorDefeito(formato.id))
      const saida = ImageMagick.read(fonte, (img) => {
        if (diretivas.quality !== null) img.quality = diretivas.quality
        for (const d of diretivas.defines) {
          img.settings.setDefine(d.format as MagickFormat, d.name, d.value)
        }
        return img.write(diretivas.magickFormat as MagickFormat, (d) => new Uint8Array(d))
      })
      // Nao verificamos a assinatura de todos, porque alguns formatos antigos
      // tem magic bytes fracos. Verificamos que o encode existe de facto.
      expect(saida.length, formato.id).toBeGreaterThan(0)
    }
  })
})
