/**
 * Contrato de mensagens entre a main thread e o worker de imagem.
 *
 * Existe para a fronteira do postMessage nao ser `any`. Sem isto, um erro de
 * nome de campo so aparece em runtime.
 */
import type { FormatId } from '@/config/formats'
import type { ConversionOptions, ImageInspection, JobErrorKind } from '@/features/converter/types'
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
      readonly kind: 'converter'
      readonly requestId: string
      readonly bytes: ArrayBuffer
      readonly options: ConversionOptions
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
      readonly kind: 'convertido'
      readonly requestId: string
      readonly bytes: ArrayBuffer
      readonly width: number
      readonly height: number
      readonly formatId: FormatId
      readonly durationMs: number
    }
  | {
      readonly kind: 'erro'
      readonly requestId: string
      readonly errorKind: JobErrorKind
      readonly message: string
      readonly detail?: string
    }

/**
 * Traduz falhas do ImageMagick em estados de erro do dominio.
 *
 * O motor devolve nomes de excecao como NoDecodeDelegateForThisImageFormat.
 * Mostrar isso ao utilizador seria um spinner sem contexto com passos extra.
 */
export function classificarErroDoMotor(mensagem: string): {
  kind: JobErrorKind
  message: string
} {
  const m = mensagem.toLowerCase()

  if (m.includes('nodecodedelegate')) {
    return {
      kind: 'formato-nao-suportado',
      message: 'Este formato de imagem não é suportado para leitura.',
    }
  }
  if (m.includes('noencodedelegate')) {
    return {
      kind: 'formato-nao-suportado',
      message: 'Não é possível gravar neste formato.',
    }
  }
  if (m.includes('corrupt') || m.includes('improperimageheader') || m.includes('unexpectedendof')) {
    return {
      kind: 'ficheiro-invalido',
      message: 'O ficheiro parece estar danificado ou incompleto.',
    }
  }
  if (m.includes('memory') || m.includes('allocat') || m.includes('cachereso')) {
    return {
      kind: 'sem-memoria',
      message:
        'Memória insuficiente para processar esta imagem. Tente uma imagem com menos pixels.',
    }
  }
  return {
    kind: 'falha-de-conversao',
    message: 'Não foi possível converter esta imagem.',
  }
}
