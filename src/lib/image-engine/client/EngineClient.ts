/**
 * Lado da main thread da fronteira do motor.
 *
 * Responsabilidades:
 *  - criar workers apenas quando forem necessarios (o binario tem 5,1 MB
 *    comprimidos, e nao se descarrega antes de existir um ficheiro);
 *  - correlacionar pedidos e respostas;
 *  - impor timeouts;
 *  - cancelar, por ficheiro ou tudo.
 *
 * A concorrencia, a exclusividade para imagens grandes e a reciclagem de
 * workers vivem no WorkerPool. Esta classe e a API estavel que o resto da
 * aplicacao usa, e nao mudou quando o worker unico passou a pool.
 */
import { MAGICK_WASM_URL } from '@/config/engine'
import { concorrenciaSugerida, LIMITES } from '@/config/limits'
import { formatoPorId } from '@/config/formats'
import type { ConversionOptions, ImageInspection } from '@/features/converter/types'
import { lerComoBuffer } from '@/lib/files/readFile'
import { registarArranqueDoMotor } from '@/lib/dev/metrics'
import type { EngineCapabilities } from '../ImageEngine'
import { inesperado, novoId, WorkerPool } from './WorkerPool'

export { ErroDoMotor } from './WorkerPool'

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

/** Contexto que ajuda o pool a agendar. Opcional: sem ele o agendamento e conservador. */
export type ContextoDaTarefa = {
  /** Identificador do trabalho, para cancelar so este ficheiro. */
  readonly chave?: string
  /** Numero de pixels, para decidir exclusividade e reciclagem. */
  readonly pixels?: number
  /** Chamado quando a tarefa deixa a fila e comeca de facto. */
  readonly onInicio?: () => void
}

export class EngineClient {
  #pool: WorkerPool | null = null
  #arranque: Promise<EngineCapabilities> | null = null
  #capacidades: EngineCapabilities | null = null

  /** Garante que o motor esta pronto. Chamadas concorrentes partilham o arranque. */
  async prepare(): Promise<EngineCapabilities> {
    this.#arranque ??= this.#arrancar()
    return this.#arranque
  }

  get capacidades(): EngineCapabilities | null {
    return this.#capacidades
  }

  get concorrencia(): number {
    return this.#pool?.concorrencia ?? 0
  }

  get emCurso(): number {
    return this.#pool?.emCurso ?? 0
  }

  get emFila(): number {
    return this.#pool?.emFila ?? 0
  }

  async inspect(file: File, contexto: ContextoDaTarefa = {}): Promise<ImageInspection> {
    await this.prepare()
    const bytes = await lerComoBuffer(file)

    const resposta = await this.#garantirPool().pedir(
      { kind: 'inspecionar', requestId: novoId(), bytes, magickFormatHint: null },
      {
        chave: contexto.chave ?? novoId(),
        timeoutMs: LIMITES.timeoutConversaoMs,
        transfer: [bytes],
        // A inspecao le apenas cabecalhos, portanto nao paga exclusividade.
      },
    )

    if (resposta.kind !== 'inspecionado') throw inesperado(resposta)
    return resposta.inspection
  }

  async convert(
    file: File,
    options: ConversionOptions,
    contexto: ContextoDaTarefa = {},
  ): Promise<ResultadoConversao> {
    await this.prepare()
    const bytes = await lerComoBuffer(file)

    const resposta = await this.#garantirPool().pedir(
      { kind: 'converter', requestId: novoId(), bytes, options },
      {
        chave: contexto.chave ?? novoId(),
        ...(contexto.pixels === undefined ? {} : { pixels: contexto.pixels }),
        ...(contexto.onInicio === undefined ? {} : { onInicio: contexto.onInicio }),
        timeoutMs: LIMITES.timeoutConversaoMs,
        transfer: [bytes],
      },
    )

    if (resposta.kind !== 'convertido') throw inesperado(resposta)

    const formato = formatoPorId(resposta.formatId)
    const blob = new Blob([resposta.bytes], { type: formato.mimeTypes[0] })

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

  /** Cancela apenas o trabalho com esta chave. Os restantes continuam. */
  cancelarTrabalho(chave: string): void {
    this.#pool?.cancelar(chave)
  }

  /** Cancela tudo o que esta em curso ou em fila. */
  cancel(): void {
    this.#pool?.cancelarTudo()
  }

  dispose(): void {
    this.#pool?.dispose()
    this.#pool = null
    this.#arranque = null
    this.#capacidades = null
  }

  // ------------------------------------------------------------------ interno

  async #arrancar(): Promise<EngineCapabilities> {
    const pool = this.#garantirPool()
    const initMs = await pool.prepararUmSlot()

    const capacidades = await pool.pedir(
      { kind: 'capacidades', requestId: novoId() },
      { chave: 'capacidades', timeoutMs: LIMITES.timeoutArranqueMotorMs },
    )
    if (capacidades.kind !== 'capacidades') throw inesperado(capacidades)

    this.#capacidades = capacidades.capabilities
    registarArranqueDoMotor(initMs, capacidades.capabilities.engineVersion)
    return capacidades.capabilities
  }

  #garantirPool(): WorkerPool {
    this.#pool ??= new WorkerPool(
      () =>
        new Worker(new URL('../../../workers/image.worker.ts', import.meta.url), {
          type: 'module',
          name: 'motor-de-imagem',
        }),
      MAGICK_WASM_URL,
      concorrenciaSugerida(),
    )
    return this.#pool
  }
}
