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

/** Etapa 2: dimensoes. So possivel depois de `inspect`, que le os cabecalhos. */
export function validarInspecao(inspecao: ImageInspection): ResultadoValidacao {
  const pixels = inspecao.width * inspecao.height

  if (inspecao.width <= 0 || inspecao.height <= 0) {
    return {
      ok: false,
      error: {
        kind: 'ficheiro-invalido',
        message: 'Não foi possível determinar as dimensões desta imagem.',
      },
    }
  }

  if (pixels > LIMITES.maxPixels) {
    return {
      ok: false,
      error: {
        kind: 'demasiado-grande',
        message:
          `A imagem tem ${formatarMegapixels(inspecao.width, inspecao.height)} e o limite ` +
          `desta versão é ${Math.round(LIMITES.maxPixels / 1_000_000)} MP. ` +
          `Imagens maiores esgotam a memória disponível no browser.`,
      },
    }
  }

  const warnings: string[] = []

  if (pixels > LIMITES.avisoPixels) {
    warnings.push(
      `Imagem grande (${formatarMegapixels(inspecao.width, inspecao.height)}). ` +
        `A conversão pode levar alguns segundos.`,
    )
  }

  // Nunca destruir animacao em silencio. CLAUDE.md, seccao 5.8.
  if (inspecao.frameCount > 1) {
    warnings.push(
      `Esta imagem tem ${inspecao.frameCount} fotogramas. Nesta versão apenas o ` +
        `primeiro é convertido.`,
    )
  }

  return {
    ok: true,
    formatId: inspecao.formatId ?? 'jpeg',
    warnings,
  }
}
