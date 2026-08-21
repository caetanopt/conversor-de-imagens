/**
 * Pool de workers do motor de imagem.
 *
 * Substitui o worker unico da primeira etapa. A API do EngineClient nao muda,
 * portanto nenhum chamador foi alterado.
 *
 * Tres comportamentos que vem de medicoes e nao de precaucao generica
 * (ver docs/medicoes.md):
 *
 *  1. **Slots preguicosos.** Cada worker paga o seu proprio heap de WASM e a
 *     sua propria compilacao do modulo. Um segundo worker so e criado quando
 *     ha de facto contencao, para o caso comum de um unico ficheiro nao pagar
 *     por concorrencia que nao usa.
 *
 *  2. **Exclusividade para imagens grandes.** Acima do limiar em limits.ts, a
 *     tarefa espera que todos os slots estejam livres e corre sozinha. Duas
 *     conversoes de 8 MP em paralelo duplicam o pico de memoria, e a memoria
 *     linear do WASM nunca encolhe.
 *
 *  3. **Reciclagem por marca de agua.** Depois de uma imagem grande, o slot e
 *     terminado e recriado. E a unica forma de devolver memoria.
 *
 * Cancelar uma tarefa em curso significa terminar o worker que a executa. A
 * conversao e uma chamada sincrona dentro do WASM e nao e interrompivel a meio.
 * Por isso a chave da tarefa importa: cancelar um ficheiro nao pode matar os
 * outros que estao a correr.
 */
import { LIMITES } from '@/config/limits'
import type { JobError } from '@/features/converter/types'
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

export type OpcoesDaTarefa = {
  /** Identificador do chamador, para poder cancelar so esta tarefa. */
  readonly chave: string
  /** Numero de pixels da imagem, quando conhecido. Decide exclusividade e reciclagem. */
  readonly pixels?: number
  readonly timeoutMs: number
  readonly transfer?: Transferable[]
  /**
   * Chamado quando a tarefa sai da fila e passa a ter um slot.
   *
   * Existe para a interface nao mentir. Com 30 ficheiros e concorrencia 2,
   * marcar tudo como "a processar" no instante em que o utilizador clica
   * mostraria 30 conversoes a decorrer quando estao duas.
   */
  readonly onInicio?: () => void
}

/** Um worker e o estado que lhe pertence. */
class Slot {
  #worker: Worker | null = null
  #pendentes = new Map<string, Pendente>()
  #arrancado = false
  /** Marca de agua: maior numero de pixels que este slot ja processou. */
  #maiorImagem = 0

  constructor(
    private readonly criarWorker: () => Worker,
    private readonly wasmUrl: string,
  ) {}

  get ocupado(): boolean {
    return this.#pendentes.size > 0
  }

  get precisaDeReciclagem(): boolean {
    return this.#maiorImagem > LIMITES.reciclarWorkerAcimaDePixels
  }

  registarImagem(pixels: number): void {
    this.#maiorImagem = Math.max(this.#maiorImagem, pixels)
  }

  /** Arranca o motor neste slot. Idempotente. */
  async arrancar(): Promise<number> {
    if (this.#arrancado) return 0
    const resposta = await this.pedir(
      { kind: 'arrancar', requestId: novoId(), wasmUrl: this.wasmUrl },
      undefined,
      LIMITES.timeoutArranqueMotorMs,
    )
    if (resposta.kind !== 'arrancado') throw inesperado(resposta)
    this.#arrancado = true
    return resposta.initMs
  }

  pedir(
    pedido: WorkerRequest,
    transfer: Transferable[] | undefined,
    timeoutMs: number,
  ): Promise<WorkerResponse> {
    const worker = this.#garantir()

    return new Promise<WorkerResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pendentes.delete(pedido.requestId)
        // Um worker que excedeu o tempo pode estar preso dentro do WASM.
        // Terminar e a unica saida.
        this.terminar()
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

  terminar(erro?: JobError): void {
    for (const pendente of this.#pendentes.values()) {
      clearTimeout(pendente.timer)
      pendente.reject(
        new ErroDoMotor(
          erro ?? {
            kind: 'motor-terminado',
            message: 'O motor de conversão foi interrompido.',
            suggestion: 'Tente converter de novo.',
          },
        ),
      )
    }
    this.#pendentes.clear()
    this.#worker?.terminate()
    this.#worker = null
    this.#arrancado = false
    this.#maiorImagem = 0
  }

  #garantir(): Worker {
    if (this.#worker) return this.#worker

    const worker = this.criarWorker()

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

    // Um erro nao capturado no worker deixaria os pedidos pendurados.
    worker.addEventListener('error', () => {
      this.terminar({
        kind: 'motor-terminado',
        message: 'O motor de conversão parou de responder.',
        suggestion: 'Recarregue a página e tente de novo.',
      })
    })

    this.#worker = worker
    return worker
  }
}

type EmFila = {
  readonly opcoes: OpcoesDaTarefa
  readonly pedido: WorkerRequest
  readonly resolve: (resposta: WorkerResponse) => void
  readonly reject: (erro: unknown) => void
  cancelada: boolean
}

export class WorkerPool {
  readonly #slots: Slot[]
  readonly #fila: EmFila[] = []
  /** Chave da tarefa em cada slot, para cancelar de forma dirigida. */
  readonly #chavePorSlot = new Map<Slot, string>()
  #exclusivaEmCurso = false
  #descartado = false

  constructor(criarWorker: () => Worker, wasmUrl: string, concorrencia: number) {
    const n = Math.max(1, Math.min(LIMITES.concorrenciaMaxima, concorrencia))
    this.#slots = Array.from({ length: n }, () => new Slot(criarWorker, wasmUrl))
  }

  get concorrencia(): number {
    return this.#slots.length
  }

  get emCurso(): number {
    return this.#chavePorSlot.size
  }

  get emFila(): number {
    return this.#fila.filter((t) => !t.cancelada).length
  }

  /** Arranca um slot, para o motor ficar pronto antes de haver trabalho. */
  async prepararUmSlot(): Promise<number> {
    const slot = this.#slots[0]
    if (!slot) throw new Error('Pool sem slots')
    return slot.arrancar()
  }

  /** Envia um pedido, aguardando a sua vez se todos os slots estiverem ocupados. */
  pedir(pedido: WorkerRequest, opcoes: OpcoesDaTarefa): Promise<WorkerResponse> {
    if (this.#descartado) {
      return Promise.reject(
        new ErroDoMotor({
          kind: 'motor-terminado',
          message: 'O motor de conversão já foi encerrado.',
        }),
      )
    }

    return new Promise<WorkerResponse>((resolve, reject) => {
      this.#fila.push({ opcoes, pedido, resolve, reject, cancelada: false })
      this.#despachar()
    })
  }

  /** Cancela uma tarefa. Se estiver em curso, termina o worker que a executa. */
  cancelar(chave: string): void {
    for (const tarefa of this.#fila) {
      if (tarefa.opcoes.chave !== chave || tarefa.cancelada) continue
      tarefa.cancelada = true
      tarefa.reject(new ErroDoMotor(ERRO_CANCELADO))
    }

    for (const [slot, chaveDoSlot] of this.#chavePorSlot) {
      if (chaveDoSlot !== chave) continue
      // Os outros slots continuam. Cancelar um ficheiro nao para o lote.
      slot.terminar(ERRO_CANCELADO)
    }
  }

  cancelarTudo(): void {
    for (const tarefa of this.#fila) {
      if (tarefa.cancelada) continue
      tarefa.cancelada = true
      tarefa.reject(new ErroDoMotor(ERRO_CANCELADO))
    }
    this.#fila.length = 0

    for (const slot of this.#slots) slot.terminar(ERRO_CANCELADO)
    this.#chavePorSlot.clear()
    this.#exclusivaEmCurso = false
  }

  dispose(): void {
    this.#descartado = true
    this.cancelarTudo()
  }

  // ------------------------------------------------------------------ interno

  #despachar(): void {
    // Limpar canceladas do inicio da fila antes de escolher.
    while (this.#fila[0]?.cancelada) this.#fila.shift()

    const proxima = this.#fila[0]
    if (!proxima) return

    // Uma tarefa exclusiva espera que TODOS os slots estejam livres, e enquanto
    // corre bloqueia o despacho. Sem isto, duas imagens grandes em paralelo
    // duplicariam o pico de memoria.
    const exclusiva = ehExclusiva(proxima.opcoes)
    if (this.#exclusivaEmCurso) return
    if (exclusiva && this.#chavePorSlot.size > 0) return

    const slot = this.#slots.find((s) => !this.#chavePorSlot.has(s) && !s.ocupado)
    if (!slot) return

    this.#fila.shift()
    this.#chavePorSlot.set(slot, proxima.opcoes.chave)
    if (exclusiva) this.#exclusivaEmCurso = true

    void this.#executar(slot, proxima, exclusiva)
  }

  async #executar(slot: Slot, tarefa: EmFila, exclusiva: boolean): Promise<void> {
    try {
      tarefa.opcoes.onInicio?.()
      await slot.arrancar()
      if (tarefa.opcoes.pixels) slot.registarImagem(tarefa.opcoes.pixels)

      const resposta = await slot.pedir(
        tarefa.pedido,
        tarefa.opcoes.transfer,
        tarefa.opcoes.timeoutMs,
      )
      if (!tarefa.cancelada) tarefa.resolve(resposta)
    } catch (erro) {
      if (!tarefa.cancelada) tarefa.reject(erro)
    } finally {
      this.#chavePorSlot.delete(slot)
      if (exclusiva) this.#exclusivaEmCurso = false

      // A memoria linear do WASM nunca encolhe. Depois de uma imagem grande, o
      // slot fica inflado para o resto da sessao, por isso e substituido.
      if (slot.precisaDeReciclagem && !slot.ocupado) slot.terminar()

      this.#despachar()
    }
  }
}

export const ERRO_CANCELADO: JobError = {
  kind: 'cancelado',
  message: 'Conversão cancelada.',
}

function ehExclusiva(opcoes: OpcoesDaTarefa): boolean {
  return (opcoes.pixels ?? 0) > LIMITES.exclusivoAcimaDePixels
}

export function novoId(): string {
  return crypto.randomUUID()
}

export function inesperado(resposta: WorkerResponse): Error {
  return new Error(`Resposta inesperada do worker: ${resposta.kind}`)
}
