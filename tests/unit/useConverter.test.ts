/**
 * useConverter: corridas na fronteira assincrona entre um dispatch e o
 * proprio estado que o motivou ja ter mudado entretanto.
 *
 * O motor fica mockado por inteiro: o hook nao sabe nada de ImageMagick, e os
 * pontos de controlo de que preciso sao quando `miniatura()` e `convert()`
 * resolvem. TIFF porque o browser nunca o descodifica (browserDecodable e
 * falso), o que garante que criarPreview() volta null e a miniatura vem
 * sempre do motor mockado, sem depender de createImageBitmap existir em
 * jsdom.
 */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ImageInspection } from '@/features/converter/types'
import { contarObjectUrlsAtivos } from '@/lib/files/objectUrls'
import type * as ReadFileModule from '@/lib/files/readFile'
import type { EngineCapabilities } from '@/lib/image-engine/ImageEngine'

let resolverMiniatura: (() => void) | null = null
let chamadasConvert = 0

// O File do jsdom nao implementa slice(...).arrayBuffer(), so mesmo motivo
// por que tests/unit/engineClient.test.ts corre em ambiente node (comentario
// nesse ficheiro). Aqui precisamos de jsdom para renderHook, por isso e
// lerCabecalho que fica falso em vez do ambiente inteiro.
vi.mock('@/lib/files/readFile', async (importarReal) => {
  const real = await importarReal<typeof ReadFileModule>()
  return {
    ...real,
    lerCabecalho: async (): Promise<Uint8Array> => {
      const cabecalho = new Uint8Array(32)
      cabecalho.set([0x49, 0x49, 0x2a, 0x00]) // assinatura TIFF little-endian
      return cabecalho
    },
  }
})

vi.mock('@/lib/image-engine/client/EngineClient', () => {
  class EngineClientFalso {
    async prepare(): Promise<EngineCapabilities> {
      return { engineVersion: 'falso', delegates: [], channelDepth: 8 }
    }

    async inspect(): Promise<ImageInspection> {
      return {
        formatId: 'tiff',
        magickFormat: 'TIFF',
        width: 400,
        height: 300,
        frameCount: 1,
        hasAlpha: false,
      }
    }

    // Bloqueia ate o teste chamar resolverMiniatura(), para simular a
    // miniatura ainda a gerar quando o utilizador remove o ficheiro.
    async miniatura(): Promise<{ blob: Blob; width: number; height: number }> {
      await new Promise<void>((resolve) => {
        resolverMiniatura = resolve
      })
      return {
        blob: new Blob([new Uint8Array(8)], { type: 'image/webp' }),
        width: 100,
        height: 75,
      }
    }

    async convert(): Promise<{
      blob: Blob
      size: number
      width: number
      height: number
      durationMs: number
      decodeMs: number
      encodeMs: number
      profilesKept: string[]
      frameCount: number
      outputFrameCount: number
    }> {
      chamadasConvert += 1
      return {
        blob: new Blob([new Uint8Array(8)], { type: 'image/webp' }),
        size: 8,
        width: 400,
        height: 300,
        durationMs: 1,
        decodeMs: 0,
        encodeMs: 1,
        profilesKept: [],
        frameCount: 1,
        outputFrameCount: 1,
      }
    }

    cancelarTrabalho(): void {}
    cancel(): void {}
    dispose(): void {}
  }

  class ErroDoMotorFalso extends Error {}

  return { EngineClient: EngineClientFalso, ErroDoMotor: ErroDoMotorFalso }
})

const { useConverter } = await import('@/features/converter/hooks/useConverter')

function ficheiroTiff(nome = 'foto.tif'): File {
  const cabecalho = new Uint8Array(32)
  cabecalho.set([0x49, 0x49, 0x2a, 0x00]) // assinatura TIFF little-endian
  return new File([cabecalho], nome, { type: 'image/tiff' })
}

describe('useConverter', () => {
  beforeEach(() => {
    resolverMiniatura = null
    chamadasConvert = 0
  })

  afterEach(() => {
    cleanup()
  })

  it('revoga o object URL da miniatura quando o ficheiro e removido antes dela terminar', async () => {
    const { result } = renderHook(() => useConverter())

    // Guarda a promessa real em vez de a descartar: e o unico sinal fiavel de
    // que analisar() terminou por completo (dispatch OU revoke, conforme o
    // job ainda exista ou nao). Um waitFor a seguir a resolverMiniatura()
    // verificava o contador ANTES da continuação assincrona ter corrido, e
    // passava sempre, mesmo com o bug — waitFor devolve na primeira verificaçao
    // que nao lance, nao espera pelo pior caso.
    let promessa!: Promise<void>
    act(() => {
      promessa = result.current.adicionarFicheiros([ficheiroTiff()])
    })

    await waitFor(() => expect(result.current.jobs).toHaveLength(1))
    const id = result.current.jobs[0]!.id

    // So a partir daqui a miniatura falsa esta mesmo bloqueada dentro do
    // motor, a espera do teste a resolver.
    await waitFor(() => expect(resolverMiniatura).not.toBeNull())

    act(() => {
      result.current.remover(id)
    })
    expect(result.current.jobs).toHaveLength(0)

    // A miniatura so termina agora, depois do job ja nao existir no estado.
    await act(async () => {
      resolverMiniatura?.()
      await promessa
    })

    // Sem a verificacao em useConverter.ts, o dispatch('preview', ...) e um
    // no-op silencioso porque o id ja nao esta na lista, e o object URL desta
    // miniatura fica para sempre em objectUrls.ts. CLAUDE.md, seccao 2.7.
    expect(contarObjectUrlsAtivos()).toBe(0)
  })

  it('um duplo clique em Converter nao arranca a mesma conversao duas vezes', async () => {
    const { result } = renderHook(() => useConverter())

    let promessaAdicionar!: Promise<void>
    act(() => {
      promessaAdicionar = result.current.adicionarFicheiros([ficheiroTiff()])
    })
    await waitFor(() => expect(resolverMiniatura).not.toBeNull())
    await act(async () => {
      resolverMiniatura?.()
      await promessaAdicionar
    })

    const id = result.current.jobs[0]!.id
    expect(result.current.jobs[0]!.status).toBe('ready')

    // As duas chamadas arrancam sem esperar uma pela outra: e exatamente um
    // duplo clique no botao "Converter", que so desliga quando
    // resumo.aProcessar sobe, e isso so acontece dentro do motor, depois de
    // ler o ficheiro inteiro para memoria. Sem a guarda sincrona em
    // converterJob, o motor mockado seria chamado duas vezes para o mesmo
    // ficheiro.
    await act(async () => {
      await Promise.all([result.current.converter(id), result.current.converter(id)])
    })

    expect(chamadasConvert).toBe(1)
  })
})
