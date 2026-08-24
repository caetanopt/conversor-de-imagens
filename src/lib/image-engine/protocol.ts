/**
 * Contrato de mensagens entre a main thread e o worker de imagem.
 *
 * Existe para a fronteira do postMessage nao ser `any`. Sem isto, um erro de
 * nome de campo so aparece em runtime.
 */
import type { FormatId } from '@/config/formats'
import type { ConversionOptions, ImageInspection, JobError, JobErrorKind } from '@/features/converter/types'
import type { EngineCapabilities } from './ImageEngine'

export type WorkerRequest =
  | { readonly kind: 'arrancar'; readonly requestId: string; readonly wasmUrl: string }
  | { readonly kind: 'capacidades'; readonly requestId: string }
  | {
      readonly kind: 'inspecionar'
      readonly requestId: string
      readonly bytes: ArrayBuffer
      readonly magickFormatHint: string | null
    }
  | {
      readonly kind: 'miniatura'
      readonly requestId: string
      readonly bytes: ArrayBuffer
      readonly magickFormatHint: string | null
      readonly larguraMaxima: number
    }
  | {
      readonly kind: 'converter'
      readonly requestId: string
      readonly bytes: ArrayBuffer
      readonly options: ConversionOptions
      /** Formato de origem, para entradas de magic bytes fracos como ICO. */
      readonly magickFormatHint: string | null
    }

export type WorkerResponse =
  | { readonly kind: 'arrancado'; readonly requestId: string; readonly initMs: number }
  | {
      readonly kind: 'capacidades'
      readonly requestId: string
      readonly capabilities: EngineCapabilities
    }
  | {
      readonly kind: 'inspecionado'
      readonly requestId: string
      readonly inspection: ImageInspection
    }
  | {
      readonly kind: 'miniatura'
      readonly requestId: string
      readonly bytes: ArrayBuffer
      readonly width: number
      readonly height: number
      readonly formatId: FormatId
      readonly durationMs: number
    }
  | {
      readonly kind: 'convertido'
      readonly requestId: string
      readonly bytes: ArrayBuffer
      readonly width: number
      readonly height: number
      readonly formatId: FormatId
      readonly durationMs: number
      readonly decodeMs: number
      readonly encodeMs: number
      readonly profilesKept: readonly string[]
      readonly frameCount: number
      readonly outputFrameCount: number
    }
  | {
      readonly kind: 'erro'
      readonly requestId: string
      readonly errorKind: JobErrorKind
      readonly message: string
      readonly suggestion?: string
      readonly detail?: string
    }

/**
 * Traduz falhas do motor em estados de erro do dominio.
 *
 * As chaves de deteccao vem de mensagens reais observadas com as fixtures de
 * teste, nao da documentacao do ImageMagick. Ver tests/fixtures e
 * tests/unit/protocol.test.ts.
 *
 * O resultado nunca contem o texto original. Mostrar
 * "NoDecodeDelegateForThisImageFormat @ error/blob.c/ImagesToBlob/2477" a um
 * utilizador nao ajuda ninguem e parece uma falha do produto.
 */
export function classificarErroDoMotor(mensagem: string): Omit<JobError, 'detail'> {
  const m = mensagem.toLowerCase()

  // ------------------------------------------------- formato nao suportado
  if (m.includes('nodecodedelegate')) {
    return {
      kind: 'formato-nao-suportado',
      message: 'Este formato de imagem não é suportado para leitura.',
      suggestion: 'Converta a imagem para JPG, PNG ou WebP antes de a usar aqui.',
    }
  }
  if (m.includes('noencodedelegate')) {
    return {
      kind: 'formato-nao-suportado',
      message: 'Não é possível gravar neste formato.',
      suggestion: 'Escolha outro formato de destino.',
    }
  }

  // -------------------------------------------------------- ficheiro invalido
  // 'unsupported marker type' vem de um JPEG com o corpo danificado.
  // 'insufficientimagedata' vem de um ficheiro demasiado curto para ter imagem.
  if (
    m.includes('corrupt') ||
    m.includes('improperimageheader') ||
    m.includes('unexpectedendof') ||
    m.includes('unsupported marker') ||
    m.includes('insufficientimagedata') ||
    m.includes('negativeorzeroimagesize') ||
    m.includes('cannot be empty')
  ) {
    return {
      kind: 'ficheiro-invalido',
      message: 'Este ficheiro está danificado ou incompleto e não pode ser lido.',
      suggestion: 'Tente exportar a imagem de novo a partir da aplicação de origem.',
    }
  }

  // ------------------------------------------------------------- sem memoria
  if (
    m.includes('memory') ||
    m.includes('allocat') ||
    m.includes('cachereso') ||
    m.includes('out of bounds') ||
    m.includes('table index is out of range')
  ) {
    return {
      kind: 'sem-memoria',
      message: 'Não há memória suficiente neste dispositivo para processar esta imagem.',
      suggestion: 'Tente uma imagem com menos pixels, ou feche outros separadores.',
    }
  }

  // ---------------------------------------------------------- motor terminado
  if (m.includes('motor nao inicializado') || m.includes('aborted')) {
    return {
      kind: 'motor-terminado',
      message: 'O motor de conversão foi interrompido antes de terminar.',
      suggestion: 'Tente converter de novo.',
    }
  }

  return {
    kind: 'falha-de-conversao',
    message: 'Não foi possível converter esta imagem.',
    suggestion: 'Tente outro formato de destino, ou uma qualidade diferente.',
  }
}
