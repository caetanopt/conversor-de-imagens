/**
 * Validacao de ficheiros do utilizador.
 *
 * Ordem deliberada: assinatura antes de extensao, porque um ficheiro
 * renomeado nao deve passar por um formato que nao e.
 */
import { formatoPorId, formatoPorMime, type FormatId } from '@/config/formats'
import { LIMITES } from '@/config/limits'
import type { ImageInspection, JobError } from '@/features/converter/types'
import { detetarFormatoPorAssinatura } from '@/lib/files/signature'
import { formatarBytes, formatarMegapixels } from '@/lib/format/bytes'

export type ResultadoValidacao =
  | { readonly ok: true; readonly formatId: FormatId; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly error: JobError }

/** Etapa 1: tamanho e assinatura. Nao precisa do motor. */
export function validarFicheiro(
  file: File,
  cabecalho: Uint8Array<ArrayBufferLike>,
): ResultadoValidacao {
  if (file.size === 0) {
    return {
      ok: false,
      error: { kind: 'ficheiro-invalido', message: 'O ficheiro está vazio.' },
    }
  }

  if (file.size > LIMITES.maxBytesPorFicheiro) {
    return {
      ok: false,
      error: {
        kind: 'demasiado-grande',
        message:
          `O ficheiro tem ${formatarBytes(file.size)} e o limite é ` +
          `${formatarBytes(LIMITES.maxBytesPorFicheiro)}.`,
      },
    }
  }

  const porAssinatura = detetarFormatoPorAssinatura(cabecalho)
  if (!porAssinatura) {
    return {
      ok: false,
      error: {
        kind: 'formato-nao-suportado',
        message: 'Este ficheiro não parece ser uma imagem num formato que reconheçamos.',
      },
    }
  }

  const formato = formatoPorId(porAssinatura)
  if (formato.release !== 'ativo' || !formato.canDecode) {
    return {
      ok: false,
      error: {
        kind: 'formato-nao-suportado',
        message: `Imagens ${formato.label} ainda não são suportadas nesta versão.`,
      },
    }
  }

  const warnings: string[] = []

  // O MIME do browser e apenas uma dica, mas uma divergencia vale um aviso.
  const porMime = file.type ? formatoPorMime(file.type) : null
  if (porMime && porMime.id !== formato.id) {
    warnings.push(
      `O ficheiro está identificado como ${porMime.label} mas o conteúdo é ${formato.label}. ` +
        `Vamos tratar como ${formato.label}.`,
    )
  }

  return { ok: true, formatId: formato.id, warnings }
}

/**
 * Etapa 2: dimensoes. So possivel depois de `inspect`, que le os cabecalhos.
 *
 * Duas grandezas diferentes, e nao uma:
 *
 *  - a area de um frame governa a MEMORIA, porque e isso que o descodificador
 *    tem de ter em RGBA de uma vez;
 *  - a area vezes o numero de frames governa o TEMPO, porque cada frame e uma
 *    imagem a codificar. Medido: 20 frames de 640x480, que sao 0,3 MP por
 *    frame e 6,1 MP no total, levaram 2,8 s a gravar em GIF.
 *
 * Tratar as duas como a mesma coisa deixava passar um GIF de 40 frames a 4K.
 */
export function validarInspecao(inspecao: ImageInspection): ResultadoValidacao {
  const areaPorFrame = inspecao.width * inspecao.height
  const frames = Math.max(1, inspecao.frameCount)
  const pixels = areaPorFrame * frames

  if (inspecao.width <= 0 || inspecao.height <= 0) {
    return {
      ok: false,
      error: {
        kind: 'ficheiro-invalido',
        message: 'Não foi possível determinar as dimensões desta imagem.',
      },
    }
  }

  const limiteMp = Math.round(LIMITES.maxPixels / 1_000_000)

  if (areaPorFrame > LIMITES.maxPixels) {
    return {
      ok: false,
      error: {
        kind: 'demasiado-grande',
        message:
          `A imagem tem ${formatarMegapixels(inspecao.width, inspecao.height)} e o limite ` +
          `desta versão é ${limiteMp} MP. ` +
          `Acima disso a conversão deixa de terminar em tempo útil no browser.`,
      },
    }
  }

  if (pixels > LIMITES.maxPixels) {
    return {
      ok: false,
      error: {
        kind: 'demasiado-grande',
        message:
          `Esta imagem tem ${frames} fotogramas de ` +
          `${formatarMegapixels(inspecao.width, inspecao.height)}, o que dá ` +
          `${Math.round(pixels / 1_000_000)} MP a converter, acima do limite de ` +
          `${limiteMp} MP desta versão.`,
        suggestion: 'Reduza as dimensões ou o número de fotogramas antes de converter.',
      },
    }
  }

  const warnings: string[] = []

  // Dois patamares, porque "alguns segundos" e "quase um minuto" nao sao a
  // mesma expectativa. Medido: 4,6 s a 12 MP, 9,3 s a 24 MP, 53 s a 40 MP.
  const dimensao =
    frames > 1
      ? `${frames} fotogramas de ${formatarMegapixels(inspecao.width, inspecao.height)}`
      : formatarMegapixels(inspecao.width, inspecao.height)

  if (pixels > LIMITES.avisoDemoraLongaPixels) {
    warnings.push(
      `Imagem muito grande (${dimensao}). ` +
        `A conversão pode levar mais de um minuto e a página tem de ficar aberta.`,
    )
  } else if (pixels > LIMITES.avisoPixels) {
    warnings.push(`Imagem grande (${dimensao}). A conversão pode levar alguns segundos.`)
  }

  // O que acontece aos fotogramas depende do formato de destino, que muda
  // depois de o ficheiro entrar. Por isso nao e um aviso guardado aqui: e
  // recalculado em state/frames.ts e mostrado junto ao seletor de destino.


  return {
    ok: true,
    formatId: inspecao.formatId ?? 'jpeg',
    warnings,
  }
}
