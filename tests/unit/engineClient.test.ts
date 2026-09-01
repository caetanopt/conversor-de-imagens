// @vitest-environment node
/**
 * A fronteira entre a aplicacao e o worker.
 *
 * Ambiente node: o `File` do jsdom nao implementa `arrayBuffer()`, que todos os
 * browsers alvo suportam. Nada aqui toca no DOM.
 *
 * Este ficheiro existe por causa de um defeito real e nao por simetria: o hint
 * de formato estava ligado em `convert` e `miniatura` e ficou esquecido em
 * `inspect`, o que fazia qualquer ICO falhar com
 * NoDecodeDelegateForThisImageFormat. O typecheck nao apanha, porque o campo
 * aceita null e null e um valor legitimo.
 *
 * O worker e falso e responde ao mesmo protocolo, portanto nao ha WASM aqui.
 */
import { describe, expect, it } from 'vitest'

import { EngineClient, ErroDoMotor } from '@/lib/image-engine/client/EngineClient'
import { opcoesPorDefeito } from '@/features/converter/state/jobsReducer'
import type { WorkerRequest, WorkerResponse } from '@/lib/image-engine/protocol'

class WorkerFalso {
  /** Todos os criados: com concorrencia 2 pode haver mais do que um slot. */
  static criados: WorkerFalso[] = []

  readonly recebidos: WorkerRequest[] = []
  #ouvintes = new Set<(evento: unknown) => void>()

  constructor() {
    WorkerFalso.criados.push(this)
  }

  /** Pedidos deste tipo em todos os workers, para nao depender de qual e o slot. */
  static pedidosDe<K extends WorkerRequest['kind']>(
    kind: K,
  ): Extract<WorkerRequest, { kind: K }>[] {
    return WorkerFalso.criados.flatMap((w) => w.pedidosDe(kind))
  }

  addEventListener(tipo: string, ouvinte: (evento: unknown) => void): void {
    if (tipo === 'message') this.#ouvintes.add(ouvinte)
  }

  terminate(): void {}

  postMessage(pedido: WorkerRequest): void {
    this.recebidos.push(pedido)
    queueMicrotask(() => this.#responder(pedido))
  }

  /** Pedidos deste tipo, para o teste nao depender da ordem de arranque. */
  pedidosDe<K extends WorkerRequest['kind']>(kind: K): Extract<WorkerRequest, { kind: K }>[] {
    return this.recebidos.filter((p): p is Extract<WorkerRequest, { kind: K }> => p.kind === kind)
  }

  #enviar(resposta: WorkerResponse): void {
    for (const ouvinte of this.#ouvintes) ouvinte({ data: resposta })
  }

  #responder(pedido: WorkerRequest): void {
    const requestId = pedido.requestId
    switch (pedido.kind) {
      case 'arrancar':
        return this.#enviar({ kind: 'arrancado', requestId, initMs: 1 })
      case 'capacidades':
        return this.#enviar({
          kind: 'capacidades',
          requestId,
          capabilities: { engineVersion: 'falso', delegates: [], channelDepth: 8 },
        })
      case 'inspecionar':
        return this.#enviar({
          kind: 'inspecionado',
          requestId,
          inspection: {
            formatId: 'ico',
            magickFormat: 'ICO',
            width: 256,
            height: 256,
            frameCount: 3,
            hasAlpha: true,
          },
        })
      case 'miniatura':
        return this.#enviar({
          kind: 'miniatura',
          requestId,
          bytes: new ArrayBuffer(16),
          width: 256,
          height: 256,
          formatId: 'webp',
          durationMs: 3,
        })
      case 'converter':
        return this.#enviar({
          kind: 'convertido',
          requestId,
          bytes: new ArrayBuffer(32),
          width: 256,
          height: 256,
          formatId: 'png',
          durationMs: 10,
          decodeMs: 4,
          encodeMs: 6,
          profilesKept: [],
          frameCount: 3,
          outputFrameCount: 1,
    backgroundKeptPercent: null,
        })
    }
  }
}

function clienteFalso(): EngineClient {
  WorkerFalso.criados = []
  return new EngineClient(() => new WorkerFalso() as unknown as Worker)
}

function ficheiro(): File {
  return new File([new Uint8Array(64)], 'favicon.ico', { type: 'image/x-icon' })
}

describe('hint de formato', () => {
  it('chega ao worker na inspecao', async () => {
    const cliente = clienteFalso()
    await cliente.inspect(ficheiro(), { magickFormatHint: 'ICO' })
    expect(WorkerFalso.pedidosDe('inspecionar')[0]?.magickFormatHint).toBe('ICO')
  })

  it('chega ao worker na miniatura', async () => {
    const cliente = clienteFalso()
    await cliente.miniatura(ficheiro(), { magickFormatHint: 'ICO' })
    expect(WorkerFalso.pedidosDe('miniatura')[0]?.magickFormatHint).toBe('ICO')
  })

  it('chega ao worker na conversao', async () => {
    const cliente = clienteFalso()
    await cliente.convert(ficheiro(), opcoesPorDefeito('png'), { magickFormatHint: 'ICO' })
    expect(WorkerFalso.pedidosDe('converter')[0]?.magickFormatHint).toBe('ICO')
  })

  it('e null quando nao e dado, e nao undefined', async () => {
    // undefined atravessa o postMessage como ausencia de campo, e o worker
    // passaria undefined ao motor em vez de null.
    const cliente = clienteFalso()
    await cliente.inspect(ficheiro())
    expect(WorkerFalso.pedidosDe('inspecionar')[0]?.magickFormatHint).toBeNull()
  })
})

describe('cancelar antes do pool', () => {
  it('nao chega a pedir nada ao worker se cancelado enquanto ainda lia o ficheiro', async () => {
    const cliente = clienteFalso()
    // Motor ja pronto, como a partir da segunda conversao numa sessao: o que
    // resta antes do pool e so a leitura do ficheiro.
    await cliente.prepare()

    const chave = 'a-cancelar'
    const promessa = cliente.convert(ficheiro(), opcoesPorDefeito('png'), { chave })
    // Sincrono, sem await: cancelarTrabalho() tem de apanhar a chamada ainda
    // dentro de #prepararELer, antes de qualquer pedido chegar ao pool.
    cliente.cancelarTrabalho(chave)

    await expect(promessa).rejects.toThrow(ErroDoMotor)
    await expect(promessa).rejects.toMatchObject({ detalhe: { kind: 'cancelado' } })
    // A prova de que nunca chegou ao pool: o worker falso nao viu o pedido.
    expect(WorkerFalso.pedidosDe('converter')).toHaveLength(0)
  })

  it('nao chega a pedir nada ao worker se cancelado enquanto ainda esperava o motor arrancar', async () => {
    const cliente = clienteFalso()
    // Sem prepare() previo: a primeira chamada e que arranca o motor, e e
    // essa espera (download e arranque do WASM numa sessao real) que fica
    // por cancelar sem a correcao.
    const chave = 'a-cancelar'
    const promessa = cliente.inspect(ficheiro(), { chave })
    cliente.cancelarTrabalho(chave)

    await expect(promessa).rejects.toMatchObject({ detalhe: { kind: 'cancelado' } })
    expect(WorkerFalso.pedidosDe('inspecionar')).toHaveLength(0)
  })

  it('uma chamada sem chave nao e afetada, mesmo chamando cancelarTrabalho com outra chave', async () => {
    const cliente = clienteFalso()
    const promessa = cliente.inspect(ficheiro())
    cliente.cancelarTrabalho('chave-nenhuma-chamada-usa')

    const i = await promessa
    expect(i.width).toBe(256)
  })
})

describe('respostas', () => {
  it('a inspecao devolve o que o worker disse', async () => {
    const cliente = clienteFalso()
    const i = await cliente.inspect(ficheiro(), { magickFormatHint: 'ICO' })
    expect(i.frameCount).toBe(3)
    expect(i.width).toBe(256)
  })

  it('a conversao devolve os fotogramas de entrada e de saida', async () => {
    const cliente = clienteFalso()
    const r = await cliente.convert(ficheiro(), opcoesPorDefeito('png'), {})
    expect(r.frameCount).toBe(3)
    expect(r.outputFrameCount).toBe(1)
    expect(r.blob.type).toBe('image/png')
  })

  it('a miniatura devolve um blob do formato certo', async () => {
    const cliente = clienteFalso()
    const m = await cliente.miniatura(ficheiro(), {})
    expect(m.blob.type).toBe('image/webp')
    expect(m.width).toBe(256)
  })

  it('as capacidades sao pedidas uma vez so, mesmo com chamadas em paralelo', async () => {
    const cliente = clienteFalso()
    await Promise.all([cliente.inspect(ficheiro()), cliente.inspect(ficheiro())])

    // O arranque e partilhado: duas chamadas concorrentes nao devem interrogar
    // o motor duas vezes.
    expect(WorkerFalso.pedidosDe('capacidades')).toHaveLength(1)
    // Cada slot arranca o seu proprio motor, uma vez cada.
    for (const w of WorkerFalso.criados) {
      expect(w.pedidosDe('arrancar')).toHaveLength(1)
    }
  })
})
