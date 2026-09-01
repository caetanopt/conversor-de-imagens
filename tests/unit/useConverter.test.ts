/**
 * useConverter: corridas na fronteira assincrona entre um dispatch e o
 * proprio estado que o motivou ja ter mudado entretanto.
 *
 * O motor fica mockado por inteiro: o hook nao sabe nada de ImageMagick, e os
 * pontos de controlo de que preciso sao quando `miniatura()` e `convert()`
 * resolvem. A pre-visualizacao pelo browser tambem fica mockada a null, para
 * a miniatura vir sempre do motor e nao depender de createImageBitmap existir
 * em jsdom.
 */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { FormatId } from '@/config/formats'
import type { ImageInspection } from '@/features/converter/types'
import { contarObjectUrlsAtivos } from '@/lib/files/objectUrls'
import type * as PreviewModule from '@/lib/files/preview'
import type * as ReadFileModule from '@/lib/files/readFile'
import type { ContextoDaTarefa } from '@/lib/image-engine/client/EngineClient'
import type { EngineCapabilities } from '@/lib/image-engine/ImageEngine'

let resolverMiniatura: (() => void) | null = null
let chamadasConvert = 0
let ultimoContextoDaMiniatura: ContextoDaTarefa | null = null
/** Tamanho que o motor falso devolve de convert(). Ajustavel por teste. */
let tamanhoConvertido = 8

/**
 * Bytes e formato da fonte, partilhados pelos mocks de leitura e de inspecao.
 *
 * Ficam numa variavel para um teste poder trocar o contentor: TIFF para os
 * casos em que basta um formato qualquer, WebP para exercitar a limpeza de
 * metadados a serio, que so existe em JPEG, PNG e WebP.
 */
let bytesDaFonte: Uint8Array<ArrayBuffer> = bytesTiff()
let formatoDaFonte: FormatId = 'tiff'

// O File do jsdom nao implementa arrayBuffer() nem slice(...).arrayBuffer(),
// so mesmo motivo por que tests/unit/engineClient.test.ts corre em ambiente
// node (comentario nesse ficheiro). Aqui precisamos de jsdom para renderHook,
// por isso e a leitura que fica falsa em vez do ambiente inteiro.
vi.mock('@/lib/files/readFile', async (importarReal) => {
  const real = await importarReal<typeof ReadFileModule>()
  return {
    ...real,
    lerCabecalho: async (): Promise<Uint8Array> => bytesDaFonte.slice(0, 32),
    lerComoBuffer: async (): Promise<ArrayBuffer> => bytesDaFonte.slice().buffer,
  }
})

// A miniatura vem sempre do motor, nunca do browser: jsdom nao tem
// createImageBitmap, e deixar o caminho do browser em jogo tornava incerto
// se `miniatura()` chegava a ser chamada — os testes esperam por ela.
vi.mock('@/lib/files/preview', async (importarReal) => {
  const real = await importarReal<typeof PreviewModule>()
  return { ...real, criarPreview: async (): Promise<null> => null }
})

vi.mock('@/lib/image-engine/client/EngineClient', () => {
  class EngineClientFalso {
    async prepare(): Promise<EngineCapabilities> {
      return { engineVersion: 'falso', delegates: [], channelDepth: 8 }
    }

    async inspect(): Promise<ImageInspection> {
      return {
        formatId: formatoDaFonte,
        magickFormat: formatoDaFonte.toUpperCase(),
        width: 400,
        height: 300,
        frameCount: 1,
        hasAlpha: false,
      }
    }

    // Bloqueia ate o teste chamar resolverMiniatura(), para simular a
    // miniatura ainda a gerar quando o utilizador remove o ficheiro. Regista
    // o contexto recebido, para o teste do pixels poder inspeciona-lo.
    async miniatura(
      _file: File,
      contexto: ContextoDaTarefa,
    ): Promise<{ blob: Blob; width: number; height: number }> {
      ultimoContextoDaMiniatura = contexto
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
      backgroundKeptPercent: number | null
    }> {
      chamadasConvert += 1
      return {
        blob: new Blob([new Uint8Array(8)], { type: 'image/webp' }),
        size: tamanhoConvertido,
        width: 400,
        height: 300,
        durationMs: 1,
        decodeMs: 0,
        encodeMs: 1,
        profilesKept: [],
        frameCount: 1,
        outputFrameCount: 1,
        backgroundKeptPercent: null,
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

function bytesTiff(): Uint8Array<ArrayBuffer> {
  const cabecalho = new Uint8Array(32)
  cabecalho.set([0x49, 0x49, 0x2a, 0x00]) // assinatura TIFF little-endian
  return cabecalho
}

const PRIVADO = 'SN-0123456789'

/**
 * WebP minimo com um bloco EXIF que carrega uma string identificavel.
 *
 * Serve para provar que a limpeza tira o bloco: o teste procura a string nos
 * bytes que o utilizador recebe.
 */
function bytesWebp(): Uint8Array<ArrayBuffer> {
  const ascii = (t: string) => [...t].map((c) => c.charCodeAt(0))
  const bloco = (fourcc: string, dados: readonly number[]) => {
    const n = dados.length
    return [
      ...ascii(fourcc),
      n & 0xff,
      (n >>> 8) & 0xff,
      (n >>> 16) & 0xff,
      (n >>> 24) & 0xff,
      ...dados,
      ...(n % 2 === 1 ? [0] : []),
    ]
  }

  // VP8X com o bit do EXIF (0x08) ligado, VP8 como substituto dos pixeis.
  const corpo = [
    ...bloco('VP8X', [0x08, 0, 0, 0, 0x0f, 0, 0, 0x0f, 0, 0]),
    ...bloco('VP8 ', [1, 2, 3, 4, 5, 6, 7, 8]),
    ...bloco('EXIF', ascii(PRIVADO)),
  ]
  const tamanho = 4 + corpo.length

  return new Uint8Array([
    ...ascii('RIFF'),
    tamanho & 0xff,
    (tamanho >>> 8) & 0xff,
    (tamanho >>> 16) & 0xff,
    (tamanho >>> 24) & 0xff,
    ...ascii('WEBP'),
    ...corpo,
  ])
}

/** O Blob do jsdom nao tem arrayBuffer(), mas o FileReader le-o. */
async function lerBlob(blob: Blob): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer())
  return new Promise((resolve, reject) => {
    const leitor = new FileReader()
    leitor.onload = () => resolve(new Uint8Array(leitor.result as ArrayBuffer))
    leitor.onerror = () => reject(leitor.error)
    leitor.readAsArrayBuffer(blob)
  })
}

function ficheiroTiff(nome = 'foto.tif'): File {
  bytesDaFonte = bytesTiff()
  formatoDaFonte = 'tiff'
  return new File([bytesDaFonte], nome, { type: 'image/tiff' })
}

function ficheiroWebp(nome = 'foto.webp'): File {
  bytesDaFonte = bytesWebp()
  formatoDaFonte = 'webp'
  return new File([bytesDaFonte], nome, { type: 'image/webp' })
}

describe('useConverter', () => {
  beforeEach(() => {
    resolverMiniatura = null
    chamadasConvert = 0
    ultimoContextoDaMiniatura = null
    tamanhoConvertido = 8
    bytesDaFonte = bytesTiff()
    formatoDaFonte = 'tiff'
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

  it('pede a miniatura do motor com os pixels da inspecao', async () => {
    // TIFF nunca passa pelo browser (browserDecodable falso), por isso a
    // miniatura vem sempre daqui: thumbnail() no motor descodifica a imagem
    // inteira antes de reduzir, com o mesmo pico de memoria de uma conversao
    // real. Sem pixels no contexto, WorkerPool.ehExclusiva() e a reciclagem
    // por marca de agua nunca viam este trabalho, e um lote de TIFF grandes
    // descodificava tudo no mesmo slot sem reciclar entre um e o seguinte.
    const { result } = renderHook(() => useConverter())

    let promessa!: Promise<void>
    act(() => {
      promessa = result.current.adicionarFicheiros([ficheiroTiff()])
    })
    await waitFor(() => expect(resolverMiniatura).not.toBeNull())
    await act(async () => {
      resolverMiniatura?.()
      await promessa
    })

    // 400 x 300 x 1 fotograma, os valores que o inspect() falso devolve.
    expect(ultimoContextoDaMiniatura?.pixels).toBe(400 * 300)
  })

  /**
   * Otimizar promete reduzir o ficheiro, CLAUDE.md seccao 12. Sem
   * redimensionar e no mesmo formato, uma recompressao que piora o tamanho
   * nao serve o utilizador para nada: o original tem os mesmos pixeis num
   * ficheiro menor.
   */
  async function converterComTamanho(tamanho: number, ficheiro = ficheiroTiff()) {
    tamanhoConvertido = tamanho
    const { result } = renderHook(() => useConverter())

    let promessa!: Promise<void>
    act(() => {
      promessa = result.current.adicionarFicheiros([ficheiro])
    })
    await waitFor(() => expect(resolverMiniatura).not.toBeNull())
    await act(async () => {
      resolverMiniatura?.()
      await promessa
    })

    const id = result.current.jobs[0]!.id
    return { result, id, ficheiro }
  }

  it('sem ganho, no mesmo formato, sem redimensionar e a manter metadados, fica com o tamanho do original', async () => {
    const { result, id, ficheiro } = await converterComTamanho(999)
    act(() => {
      result.current.definirFormatoDeSaida(id, 'tiff') // mesmo formato da origem
      result.current.definirMetadados(id, 'manter')
    })

    await act(async () => {
      await result.current.converter(id)
    })

    const job = result.current.jobs[0]!
    expect(job.result?.size).toBe(ficheiro.size)
  })

  it('sem ganho e a preservar a cor, entrega o original limpo em vez de um ficheiro maior', async () => {
    // O caso que o utilizador encontrou: WebP bem comprimido, preset de
    // qualidade alta, politica de metadados por defeito. O resultado tem de
    // ser menor ou igual ao original E sem os metadados privados.
    const { result, id, ficheiro } = await converterComTamanho(999, ficheiroWebp())
    act(() => {
      result.current.definirFormatoDeSaida(id, 'webp')
      result.current.definirMetadados(id, 'preservar-cor')
    })

    await act(async () => {
      await result.current.converter(id)
    })

    const job = result.current.jobs[0]!
    // Nunca maior do que o original, e menor porque o EXIF saiu.
    expect(job.result?.size).toBeLessThan(ficheiro.size)

    // E os metadados privados nao voltaram pela porta do lado.
    const recebidos = await lerBlob(job.result!.blob)
    const comoTexto = String.fromCharCode(...recebidos)
    expect(comoTexto).not.toContain(PRIVADO)
  })

  it('com o fundo removido, nao troca o resultado pelo original mesmo ficando maior', async () => {
    /*
     * A regra "nunca maior do que o original" nao se aplica quando os pixeis
     * pedidos nao sao os do original.
     *
     * Remover o fundo torna transparente uma parte da imagem, e um ficheiro com
     * canal alfa e quase sempre maior do que o opaco de onde veio. Sem este
     * guarda, a alternativa do original disparava precisamente nos casos em que
     * a opcao foi usada, e o utilizador recebia a imagem COM fundo depois de
     * pedir para o tirar, sem nenhum erro a explicar porque.
     */
    const { result, id, ficheiro } = await converterComTamanho(999, ficheiroWebp())
    act(() => {
      result.current.definirFormatoDeSaida(id, 'webp')
      result.current.definirFundo(id, 'exata')
    })

    await act(async () => {
      await result.current.converter(id)
    })

    const job = result.current.jobs[0]!
    // O resultado do motor, mesmo sendo maior: e o unico que tem o recorte.
    expect(job.result?.size).toBe(999)
    expect(job.result?.size).toBeGreaterThan(ficheiro.size)
  })

  it('sem o fundo removido, a regra do original continua a valer', async () => {
    // O par do teste acima: a mesma situacao com a opcao desligada tem de
    // continuar a entregar o original limpo. O guarda nao pode ter desligado a
    // garantia para todos os casos.
    const { result, id, ficheiro } = await converterComTamanho(999, ficheiroWebp())
    act(() => {
      result.current.definirFormatoDeSaida(id, 'webp')
      result.current.definirFundo(id, null)
    })

    await act(async () => {
      await result.current.converter(id)
    })

    expect(result.current.jobs[0]!.result?.size).toBeLessThan(ficheiro.size)
  })

  it('num contentor que nao sabemos limpar, um aumento fica visivel em vez de reintroduzir metadados', async () => {
    // TIFF nao entra na limpeza ao nivel do contentor. Sem garantia a dar,
    // a escolha honesta e mostrar o aumento: devolver o original reintroduzia
    // os metadados que a politica pediu para eliminar. CLAUDE.md, seccao 20.
    const { result, id, ficheiro } = await converterComTamanho(999)
    act(() => {
      result.current.definirFormatoDeSaida(id, 'tiff')
      result.current.definirMetadados(id, 'preservar-cor')
    })

    await act(async () => {
      await result.current.converter(id)
    })

    const job = result.current.jobs[0]!
    expect(job.result?.size).toBe(999)
    expect(job.result?.blob).not.toBe(ficheiro)
  })

  it('quando a recompressao reduz o ficheiro, usa o resultado do motor', async () => {
    const { result, id, ficheiro } = await converterComTamanho(8)
    act(() => {
      result.current.definirFormatoDeSaida(id, 'tiff')
    })

    await act(async () => {
      await result.current.converter(id)
    })

    const job = result.current.jobs[0]!
    expect(job.result?.size).toBe(8)
    expect(job.result?.blob).not.toBe(ficheiro)
  })

  it('ao mudar de formato, um aumento de tamanho fica visivel em vez de escondido', async () => {
    const { result, id, ficheiro } = await converterComTamanho(999)
    act(() => {
      result.current.definirFormatoDeSaida(id, 'webp') // formato diferente da origem (tiff)
    })

    await act(async () => {
      await result.current.converter(id)
    })

    const job = result.current.jobs[0]!
    expect(job.result?.size).toBe(999)
    expect(job.result?.blob).not.toBe(ficheiro)
  })

  it('ao redimensionar, um aumento de tamanho tambem fica visivel', async () => {
    const { result, id, ficheiro } = await converterComTamanho(999)
    act(() => {
      result.current.definirFormatoDeSaida(id, 'tiff')
      result.current.definirResize(id, {
        width: 100,
        height: null,
        preserveAspectRatio: true,
        allowUpscale: false,
      })
    })

    await act(async () => {
      await result.current.converter(id)
    })

    const job = result.current.jobs[0]!
    expect(job.result?.size).toBe(999)
    expect(job.result?.blob).not.toBe(ficheiro)
  })
})
