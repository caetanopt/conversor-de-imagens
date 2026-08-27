/**
 * Comportamento do pool de workers.
 *
 * O pool recebe a fabrica de workers por parametro, portanto testa-se sem
 * WebAssembly e sem browser: o worker falso responde ao mesmo protocolo.
 *
 * O que se verifica aqui e o que nao se ve olhando para o codigo: quantos
 * trabalhos correm ao mesmo tempo, se uma imagem grande espera pelas outras,
 * e se cancelar um ficheiro deixa os restantes a correr.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LIMITES } from '@/config/limits'
import { ErroDoMotor, WorkerPool } from '@/lib/image-engine/client/WorkerPool'
import type { WorkerRequest, WorkerResponse } from '@/lib/image-engine/protocol'

/**
 * Worker falso.
 *
 * Guarda os pedidos recebidos e so responde quando o teste mandar, porque a
 * questao interessante e sempre o que acontece enquanto um trabalho esta a
 * decorrer.
 */
class WorkerFalso {
  static criados: WorkerFalso[] = []

  readonly recebidos: WorkerRequest[] = []
  terminado = false
  #ouvintes = new Map<string, Set<(evento: unknown) => void>>()

  constructor() {
    WorkerFalso.criados.push(this)
  }

  addEventListener(tipo: string, ouvinte: (evento: unknown) => void): void {
    const conjunto = this.#ouvintes.get(tipo) ?? new Set()
    conjunto.add(ouvinte)
    this.#ouvintes.set(tipo, conjunto)
  }

  postMessage(pedido: WorkerRequest): void {
    this.recebidos.push(pedido)
    // O arranque responde de imediato: nao e o que estes testes medem.
    if (pedido.kind === 'arrancar') {
      queueMicrotask(() => this.responder({ kind: 'arrancado', requestId: pedido.requestId, initMs: 1 }))
    }
  }

  terminate(): void {
    this.terminado = true
  }

  responder(resposta: WorkerResponse): void {
    for (const ouvinte of this.#ouvintes.get('message') ?? []) ouvinte({ data: resposta })
  }

  /** Ultimo pedido que nao seja de arranque. */
  get ultimoTrabalho(): WorkerRequest | undefined {
    return this.recebidos.filter((p) => p.kind !== 'arrancar').at(-1)
  }

  concluir(width = 10, height = 10): void {
    const pedido = this.ultimoTrabalho
    if (!pedido) throw new Error('Nao ha trabalho pendente neste worker')
    this.responder({
      kind: 'convertido',
      requestId: pedido.requestId,
      bytes: new ArrayBuffer(8),
      width,
      height,
      formatId: 'webp',
      durationMs: 5,
      decodeMs: 2,
      encodeMs: 3,
      profilesKept: [],
      frameCount: 1,
      outputFrameCount: 1,
    })
  }
}

function novoPool(concorrencia = 2): WorkerPool {
  return new WorkerPool(() => new WorkerFalso() as unknown as Worker, 'magick.wasm', concorrencia)
}

function pedidoDeConversao(id: string): WorkerRequest {
  return {
    kind: 'converter',
    requestId: id,
    bytes: new ArrayBuffer(8),
    magickFormatHint: null,
    options: {
      outputFormat: 'webp',
      quality: 80,
      preset: 'equilibrado',
      metadata: 'preservar-cor',
      autoOrient: true,
      lossless: false,
      resize: null,
      palette: null,
    },
  }
}

/** Deixa correr as microtarefas pendentes, que e como o pool despacha. */
async function assentar(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve()
}

const PEQUENA = 1_000_000
const GRANDE = LIMITES.exclusivoAcimaDePixels + 1_000_000

beforeEach(() => {
  WorkerFalso.criados = []
})

afterEach(() => {
  vi.useRealTimers()
})

describe('concorrencia', () => {
  it('cria o segundo worker apenas quando o primeiro esta ocupado', async () => {
    const pool = novoPool(2)

    void pool.pedir(pedidoDeConversao('a'), { chave: 'a', pixels: PEQUENA, timeoutMs: 1000 })
    await assentar()
    expect(WorkerFalso.criados).toHaveLength(1)

    void pool.pedir(pedidoDeConversao('b'), { chave: 'b', pixels: PEQUENA, timeoutMs: 1000 })
    await assentar()
    expect(WorkerFalso.criados).toHaveLength(2)
  })

  it('nao passa do numero de slots, mesmo com muitos pedidos', async () => {
    const pool = novoPool(2)

    for (const chave of ['a', 'b', 'c', 'd', 'e']) {
      void pool.pedir(pedidoDeConversao(chave), { chave, pixels: PEQUENA, timeoutMs: 1000 })
    }
    await assentar()

    expect(WorkerFalso.criados).toHaveLength(2)
    expect(pool.emCurso).toBe(2)
    expect(pool.emFila).toBe(3)
  })

  it('despacha o seguinte quando um trabalho termina', async () => {
    const pool = novoPool(2)
    const promessas = ['a', 'b', 'c'].map((chave) =>
      pool.pedir(pedidoDeConversao(chave), { chave, pixels: PEQUENA, timeoutMs: 1000 }),
    )
    await assentar()
    expect(pool.emFila).toBe(1)

    WorkerFalso.criados[0]!.concluir()
    await promessas[0]
    await assentar()

    expect(pool.emFila).toBe(0)
    expect(pool.emCurso).toBe(2)
  })

  it('respeita o maximo configurado, mesmo que pecam mais', () => {
    const pool = novoPool(99)
    expect(pool.concorrencia).toBe(LIMITES.concorrenciaMaxima)
  })
})

describe('exclusividade para imagens grandes', () => {
  it('uma imagem grande espera que os slots fiquem livres', async () => {
    const pool = novoPool(2)

    const pequena = pool.pedir(pedidoDeConversao('a'), { chave: 'a', pixels: PEQUENA, timeoutMs: 1000 })
    await assentar()

    void pool.pedir(pedidoDeConversao('grande'), { chave: 'grande', pixels: GRANDE, timeoutMs: 1000 })
    await assentar()

    // A grande nao arrancou: continuaria a haver duas conversoes em memoria.
    expect(WorkerFalso.criados).toHaveLength(1)
    expect(pool.emFila).toBe(1)

    WorkerFalso.criados[0]!.concluir()
    await pequena
    await assentar()

    expect(pool.emCurso).toBe(1)
    expect(pool.emFila).toBe(0)
  })

  it('enquanto a grande corre, nada mais arranca', async () => {
    const pool = novoPool(2)

    void pool.pedir(pedidoDeConversao('grande'), { chave: 'grande', pixels: GRANDE, timeoutMs: 1000 })
    await assentar()
    expect(pool.emCurso).toBe(1)

    void pool.pedir(pedidoDeConversao('b'), { chave: 'b', pixels: PEQUENA, timeoutMs: 1000 })
    await assentar()

    expect(pool.emCurso).toBe(1)
    expect(pool.emFila).toBe(1)
  })
})

describe('reciclagem', () => {
  it('substitui o worker depois de uma imagem grande', async () => {
    const pool = novoPool(1)
    const acima = LIMITES.reciclarWorkerAcimaDePixels + 1

    const primeira = pool.pedir(pedidoDeConversao('a'), { chave: 'a', pixels: acima, timeoutMs: 1000 })
    await assentar()
    const primeiroWorker = WorkerFalso.criados[0]!

    primeiroWorker.concluir()
    await primeira
    await assentar()

    // A memoria linear do WASM nunca encolhe: terminar o worker e a unica
    // forma de a devolver.
    expect(primeiroWorker.terminado).toBe(true)

    void pool.pedir(pedidoDeConversao('b'), { chave: 'b', pixels: 1000, timeoutMs: 1000 })
    await assentar()
    expect(WorkerFalso.criados).toHaveLength(2)
  })

  it('mantem o worker depois de uma imagem pequena', async () => {
    const pool = novoPool(1)

    const primeira = pool.pedir(pedidoDeConversao('a'), { chave: 'a', pixels: 1000, timeoutMs: 1000 })
    await assentar()
    WorkerFalso.criados[0]!.concluir()
    await primeira
    await assentar()

    expect(WorkerFalso.criados[0]!.terminado).toBe(false)

    void pool.pedir(pedidoDeConversao('b'), { chave: 'b', pixels: 1000, timeoutMs: 1000 })
    await assentar()
    expect(WorkerFalso.criados).toHaveLength(1)
  })
})

describe('cancelamento', () => {
  it('cancelar um ficheiro nao para os outros', async () => {
    const pool = novoPool(2)

    const a = pool.pedir(pedidoDeConversao('a'), { chave: 'a', pixels: PEQUENA, timeoutMs: 1000 })
    const b = pool.pedir(pedidoDeConversao('b'), { chave: 'b', pixels: PEQUENA, timeoutMs: 1000 })
    await assentar()

    pool.cancelar('a')

    await expect(a).rejects.toThrow(ErroDoMotor)
    expect(WorkerFalso.criados[0]!.terminado).toBe(true)
    expect(WorkerFalso.criados[1]!.terminado).toBe(false)

    WorkerFalso.criados[1]!.concluir()
    await expect(b).resolves.toMatchObject({ kind: 'convertido' })
  })

  it('o erro de cancelamento e distinguivel de uma falha', async () => {
    const pool = novoPool(1)
    const a = pool.pedir(pedidoDeConversao('a'), { chave: 'a', pixels: PEQUENA, timeoutMs: 1000 })
    await assentar()

    pool.cancelar('a')

    await expect(a).rejects.toMatchObject({ detalhe: { kind: 'cancelado' } })
  })

  it('cancelar um ficheiro em fila nao toca nos workers', async () => {
    const pool = novoPool(1)

    const emCurso = pool.pedir(pedidoDeConversao('a'), { chave: 'a', pixels: PEQUENA, timeoutMs: 1000 })
    const emFila = pool.pedir(pedidoDeConversao('b'), { chave: 'b', pixels: PEQUENA, timeoutMs: 1000 })
    await assentar()

    pool.cancelar('b')
    await expect(emFila).rejects.toMatchObject({ detalhe: { kind: 'cancelado' } })
    expect(WorkerFalso.criados[0]!.terminado).toBe(false)

    WorkerFalso.criados[0]!.concluir()
    await expect(emCurso).resolves.toMatchObject({ kind: 'convertido' })
  })

  it('cancelarTudo rejeita o que corre e o que espera', async () => {
    const pool = novoPool(2)
    const promessas = ['a', 'b', 'c'].map((chave) =>
      pool.pedir(pedidoDeConversao(chave), { chave, pixels: PEQUENA, timeoutMs: 1000 }),
    )
    await assentar()

    pool.cancelarTudo()

    for (const promessa of promessas) {
      await expect(promessa).rejects.toMatchObject({ detalhe: { kind: 'cancelado' } })
    }
    expect(pool.emCurso).toBe(0)
    expect(pool.emFila).toBe(0)
  })

  it('depois de dispose, novos pedidos sao recusados sem criar workers', async () => {
    const pool = novoPool(1)
    pool.dispose()

    await expect(
      pool.pedir(pedidoDeConversao('a'), { chave: 'a', pixels: PEQUENA, timeoutMs: 1000 }),
    ).rejects.toMatchObject({ detalhe: { kind: 'motor-terminado' } })
    expect(WorkerFalso.criados).toHaveLength(0)
  })
})

describe('onInicio', () => {
  it('dispara quando a tarefa arranca, nao quando entra na fila', async () => {
    const pool = novoPool(1)
    const arrancou: string[] = []

    const a = pool.pedir(pedidoDeConversao('a'), {
      chave: 'a',
      pixels: PEQUENA,
      timeoutMs: 1000,
      onInicio: () => arrancou.push('a'),
    })
    void pool.pedir(pedidoDeConversao('b'), {
      chave: 'b',
      pixels: PEQUENA,
      timeoutMs: 1000,
      onInicio: () => arrancou.push('b'),
    })
    await assentar()

    // Com um slot, 'b' esta em fila: dizer que esta a processar seria mentira.
    expect(arrancou).toEqual(['a'])

    WorkerFalso.criados[0]!.concluir()
    await a
    await assentar()

    expect(arrancou).toEqual(['a', 'b'])
  })
})

describe('timeout', () => {
  it('termina o worker preso e devolve tempo-excedido', async () => {
    vi.useFakeTimers()
    const pool = novoPool(1)

    const a = pool.pedir(pedidoDeConversao('a'), { chave: 'a', pixels: PEQUENA, timeoutMs: 5000 })
    // O tratador tem de estar ligado antes de o tempo avancar, senao a
    // rejeicao acontece sem ninguem a ouvir e o Node reporta-a como nao
    // tratada mesmo quando o teste passa.
    const desfecho = a.catch((erro: unknown) => erro)
    await vi.advanceTimersByTimeAsync(0)
    await assentar()

    await vi.advanceTimersByTimeAsync(5001)

    expect(await desfecho).toMatchObject({ detalhe: { kind: 'tempo-excedido' } })
    expect(WorkerFalso.criados[0]!.terminado).toBe(true)
  })
})
