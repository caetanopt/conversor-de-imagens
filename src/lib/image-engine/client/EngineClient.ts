/**
 * Lado da main thread da fronteira do motor.
 *
 * Responsabilidades:
 *  - criar o worker apenas quando for necessario (o binario tem 5,1 MB
 *    comprimidos, e nao se descarrega antes de existir um ficheiro);
 *  - correlacionar pedidos e respostas por id;
 *  - impor timeouts;
 *  - cancelar;
 *  - reciclar o worker depois de imagens grandes.
 *
 * Cancelamento e reciclagem sao a mesma operacao: terminar o worker. A
 * conversao e uma chamada sincrona dentro do WASM e nao e interrompivel a
 * meio, portanto nao ha cancelamento cooperativo possivel. Isto e uma
 * limitacao real do motor, assumida em vez de disfarcada.
 *
 * A concorrencia fica em 1 nesta etapa. O pool de varios workers entra com o
 * lote, atras desta mesma API, sem os chamadores mudarem.
 */
import { MAGICK_WASM_URL } from '@/config/engine'
import { LIMITES } from '@/config/limits'
import { formatoPorId } from '@/config/formats'
import type {
  ConversionOptions,
  ImageInspection,
  JobError,
} from '@/features/converter/types'
import { lerComoBuffer } from '@/lib/files/readFile'
import { registarArranqueDoMotor } from '@/lib/dev/metrics'
import type { EngineCapabilities } from '../ImageEngine'
import type { WorkerRequest, WorkerResponse } from '../protocol'

export class ErroDoMotor extends Error {
  constructor(readonly detalhe: JobError) {
    super(detalhe.message)
    this.name = 'ErroDoMotor'
  }
}

type Pendente = {
  readonly resolve: (resposta: WorkerResponse) => void
  readonly reject: (erro: unknown) => void
  readonly timer: ReturnType<typeof setTimeout>
}

export type ResultadoConversao = {
  readonly blob: Blob
  readonly size: number
  readonly width: number
  readonly height: number
  readonly durationMs: number
  readonly decodeMs: number
  readonly encodeMs: number
  readonly profilesKept: readonly string[]
}

export class EngineClient {
  #worker: Worker | null = null
  #arranque: Promise<EngineCapabilities> | null = null
  #pendentes = new Map<string, Pendente>()
  #capacidades: EngineCapabilities | null = null

  /** Garante que o motor esta pronto. Chamadas concorrentes partilham o arranque. */
  async prepare(): Promise<EngineCapabilities> {
    this.#arranque ??= this.#arrancar()
    return this.#arranque
  }

  get capacidades(): EngineCapabilities | null {
    return this.#capacidades
  }

  async inspect(file: File): Promise<ImageInspection> {
    await this.prepare()
    const bytes = await lerComoBuffer(file)
    const resposta = await this.#pedir(
      {
        kind: 'inspecionar',
        requestId: novoId(),
        bytes,
        magickFormatHint: null,
      },
      [bytes],
      LIMITES.timeoutConversaoMs,
    )
    if (resposta.kind !== 'inspecionado') throw inesperado(resposta)
    return resposta.inspection
  }

  async convert(file: File, options: ConversionOptions): Promise<ResultadoConversao> {
    await this.prepare()
    const bytes = await lerComoBuffer(file)

    const resposta = await this.#pedir(
      { kind: 'converter', requestId: novoId(), bytes, options },
      [bytes],
      LIMITES.timeoutConversaoMs,
    )
    if (resposta.kind !== 'convertido') throw inesperado(resposta)

    const formato = formatoPorId(resposta.formatId)
    const blob = new Blob([resposta.bytes], { type: formato.mimeTypes[0] })

    // A memoria linear do WASM nunca encolhe. Depois de uma imagem grande, o
    // worker fica inflado para o resto da sessao, por isso e substituido.
    if (resposta.width * resposta.height > LIMITES.reciclarWorkerAcimaDePixels) {
      this.reciclar()
    }

    return {
      blob,
      size: blob.size,
      width: resposta.width,
      height: resposta.height,
      durationMs: resposta.durationMs,
      decodeMs: resposta.decodeMs,
      encodeMs: resposta.encodeMs,
      profilesKept: resposta.profilesKept,
    }
  }

  /** Cancela tudo o que esta em curso. Unica forma de parar um encode do WASM. */
  cancel(): void {
    this.#rejeitarPendentes({
      kind: 'motor-terminado',
      message: 'Conversão cancelada.',
    })
    this.#destruirWorker()
  }

  /** Substitui o worker para devolver memoria, sem afetar pedidos futuros. */
  reciclar(): void {
    if (this.#pendentes.size > 0) return
    this.#destruirWorker()
  }

  dispose(): void {
    this.cancel()
    this.#capacidades = null
  }

  // ------------------------------------------------------------------ interno

  async #arrancar(): Promise<EngineCapabilities> {
    const arrancado = await this.#pedir(
      { kind: 'arrancar', requestId: novoId(), wasmUrl: MAGICK_WASM_URL },
      undefined,
      LIMITES.timeoutArranqueMotorMs,
    )
    if (arrancado.kind !== 'arrancado') throw inesperado(arrancado)

    const capacidades = await this.#pedir(
      { kind: 'capacidades', requestId: novoId() },
      undefined,
      LIMITES.timeoutArranqueMotorMs,
    )
    if (capacidades.kind !== 'capacidades') throw inesperado(capacidades)

    this.#capacidades = capacidades.capabilities
    registarArranqueDoMotor(arrancado.initMs, capacidades.capabilities.engineVersion)
    return capacidades.capabilities
  }

  #garantirWorker(): Worker {
    if (this.#worker) return this.#worker

    const worker = new Worker(new URL('../../../workers/image.worker.ts', import.meta.url), {
      type: 'module',
      name: 'motor-de-imagem',
    })

    worker.addEventListener('message', (evento: MessageEvent<WorkerResponse>) => {
      const resposta = evento.data
      const pendente = this.#pendentes.get(resposta.requestId)
      if (!pendente) return
      clearTimeout(pendente.timer)
      this.#pendentes.delete(resposta.requestId)

      if (resposta.kind === 'erro') {
        pendente.reject(
          new ErroDoMotor({
            kind: resposta.errorKind,
            message: resposta.message,
            ...(resposta.suggestion === undefined ? {} : { suggestion: resposta.suggestion }),
            ...(resposta.detail === undefined ? {} : { detail: resposta.detail }),
          }),
        )
        return
      }
      pendente.resolve(resposta)
    })

    // Um erro nao capturado no worker deixaria todos os pedidos pendurados.
    worker.addEventListener('error', () => {
      this.#rejeitarPendentes({
        kind: 'motor-terminado',
        message: 'O motor de conversão parou de responder.',
        suggestion: 'Recarregue a página e tente de novo.',
      })
      this.#destruirWorker()
    })

    this.#worker = worker
    return worker
  }

  #pedir(
    pedido: WorkerRequest,
    transfer: Transferable[] | undefined,
    timeoutMs: number,
  ): Promise<WorkerResponse> {
    const worker = this.#garantirWorker()

    return new Promise<WorkerResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pendentes.delete(pedido.requestId)
        // Um worker que excedeu o tempo pode estar preso dentro do WASM.
        // Terminar e a unica saida.
        this.#destruirWorker()
        reject(
          new ErroDoMotor({
            kind: 'tempo-excedido',
            message: 'A operação demorou demasiado tempo e foi interrompida.',
            suggestion: 'Tente uma imagem com menos pixels.',
          }),
        )
      }, timeoutMs)

      this.#pendentes.set(pedido.requestId, { resolve, reject, timer })

      if (transfer && transfer.length > 0) {
        worker.postMessage(pedido, transfer)
      } else {
        worker.postMessage(pedido)
      }
    })
  }

  #rejeitarPendentes(erro: JobError): void {
    for (const pendente of this.#pendentes.values()) {
      clearTimeout(pendente.timer)
      pendente.reject(new ErroDoMotor(erro))
    }
    this.#pendentes.clear()
  }

  #destruirWorker(): void {
    this.#worker?.terminate()
    this.#worker = null
    this.#arranque = null
  }
}

function novoId(): string {
  return crypto.randomUUID()
}

function inesperado(resposta: WorkerResponse): Error {
  return new Error(`Resposta inesperada do worker: ${resposta.kind}`)
}
