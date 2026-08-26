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
import { ERRO_CANCELADO, ErroDoMotor, inesperado, novoId, WorkerPool } from './WorkerPool'

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
  readonly frameCount: number
  readonly outputFrameCount: number
}

/** Contexto que ajuda o pool a agendar. Opcional: sem ele o agendamento e conservador. */
export type ContextoDaTarefa = {
  /** Identificador do trabalho, para cancelar so este ficheiro. */
  readonly chave?: string
  /** Numero de pixels, para decidir exclusividade e reciclagem. */
  readonly pixels?: number
  /** Formato de origem para o motor, quando os magic bytes nao bastam. */
  readonly magickFormatHint?: string | null
  /** Chamado quando a tarefa deixa a fila e comeca de facto. */
  readonly onInicio?: () => void
}

export class EngineClient {
  #pool: WorkerPool | null = null
  #arranque: Promise<EngineCapabilities> | null = null
  #capacidades: EngineCapabilities | null = null

  /**
   * Uma entrada por chamada a inspect/miniatura/convert ainda antes do pool.
   *
   * prepare() (que na primeira chamada da sessao espera pelo download e
   * arranque do WASM) e a leitura do ficheiro inteiro para memoria acontecem
   * antes de pedir um slot ao pool, e WorkerPool.cancelar so alcanca tarefas
   * ja na sua fila ou a correr num slot. Sem isto, cancelarTrabalho nao tinha
   * nada para cancelar nessa janela: a chamada prosseguia ate ao fim em
   * segundo plano, a gastar CPU e memoria por um ficheiro que o utilizador ja
   * tinha pedido para tirar da fila.
   */
  #antesDoPool = new Map<string, { cancelada: boolean }>()

  /**
   * A fabrica de workers e injetavel apenas para testes.
   *
   * Existe por causa de um defeito real: o hint de formato estava ligado em
   * `convert` e `miniatura` e ficou esquecido em `inspect`, o que impedia
   * qualquer ICO de ser lido. O typecheck nao apanha isso, porque o campo
   * aceita null. Um teste com um worker falso apanha.
   */
  constructor(private readonly criarWorkerParaTestes?: () => Worker) {}

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
    const bytes = await this.#prepararELer(file, contexto.chave)

    const resposta = await this.#garantirPool().pedir(
      {
        kind: 'inspecionar',
        requestId: novoId(),
        bytes,
        magickFormatHint: contexto.magickFormatHint ?? null,
      },
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

  /**
   * Miniatura produzida pelo motor.
   *
   * Usada apenas quando o browser nao descodifica o formato, hoje TIFF. Para
   * os outros a miniatura sai do proprio browser, que e mais rapido e nao
   * ocupa o motor.
   */
  async miniatura(
    file: File,
    contexto: ContextoDaTarefa = {},
  ): Promise<{ readonly blob: Blob; readonly width: number; readonly height: number }> {
    const bytes = await this.#prepararELer(file, contexto.chave)

    const resposta = await this.#garantirPool().pedir(
      {
        kind: 'miniatura',
        requestId: novoId(),
        bytes,
        magickFormatHint: contexto.magickFormatHint ?? null,
        larguraMaxima: LIMITES.larguraPreview,
      },
      {
        chave: contexto.chave ?? novoId(),
        ...(contexto.pixels === undefined ? {} : { pixels: contexto.pixels }),
        timeoutMs: LIMITES.timeoutConversaoMs,
        transfer: [bytes],
      },
    )

    if (resposta.kind !== 'miniatura') throw inesperado(resposta)

    const formato = formatoPorId(resposta.formatId)
    return {
      blob: new Blob([resposta.bytes], { type: formato.mimeTypes[0] }),
      width: resposta.width,
      height: resposta.height,
    }
  }

  async convert(
    file: File,
    options: ConversionOptions,
    contexto: ContextoDaTarefa = {},
  ): Promise<ResultadoConversao> {
    const bytes = await this.#prepararELer(file, contexto.chave)

    const resposta = await this.#garantirPool().pedir(
      {
        kind: 'converter',
        requestId: novoId(),
        bytes,
        options,
        magickFormatHint: contexto.magickFormatHint ?? null,
      },
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
      frameCount: resposta.frameCount,
      outputFrameCount: resposta.outputFrameCount,
    }
  }

  /** Cancela apenas o trabalho com esta chave. Os restantes continuam. */
  cancelarTrabalho(chave: string): void {
    // Se ainda estiver antes do pool (prepare ou leitura do ficheiro em
    // curso), marca para #prepararELer interromper no proximo checkpoint.
    const entrada = this.#antesDoPool.get(chave)
    if (entrada) entrada.cancelada = true
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

  /**
   * Prepara o motor e le o ficheiro inteiro para memoria, interrompivel por
   * cancelarTrabalho a qualquer momento antes disto acabar.
   *
   * Sem chave nao ha como cancelar dirigido a esta chamada, portanto segue
   * direto. Com chave, verifica depois de CADA await: depois de prepare()
   * cobre um cancelamento pedido enquanto a sessao ainda esperava pelo
   * download e arranque do WASM, depois da leitura cobre um pedido durante a
   * propria leitura do ficheiro. Nenhuma das duas e abortavel a meio (nem
   * prepare() nem Blob.arrayBuffer aceitam um AbortSignal), mas o que importa
   * e nao ocupar um slot do pool a seguir: e ali que fica o custo real, o
   * motor WASM a descodificar ou codificar.
   */
  async #prepararELer(file: File, chave: string | undefined): Promise<ArrayBuffer> {
    if (chave === undefined) {
      await this.prepare()
      return lerComoBuffer(file)
    }

    const entrada = { cancelada: false }
    this.#antesDoPool.set(chave, entrada)
    try {
      await this.prepare()
      if (entrada.cancelada) throw new ErroDoMotor(ERRO_CANCELADO)

      const bytes = await lerComoBuffer(file)
      if (entrada.cancelada) throw new ErroDoMotor(ERRO_CANCELADO)

      return bytes
    } finally {
      // So a propria entrada: nunca apagar a de uma chamada mais recente que,
      // por acaso, reuse a mesma chave.
      if (this.#antesDoPool.get(chave) === entrada) this.#antesDoPool.delete(chave)
    }
  }

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
      this.criarWorkerParaTestes ??
        (() =>
          new Worker(new URL('../../../workers/image.worker.ts', import.meta.url), {
            type: 'module',
            name: 'motor-de-imagem',
          })),
      MAGICK_WASM_URL,
      concorrenciaSugerida(),
    )
    return this.#pool
  }
}
