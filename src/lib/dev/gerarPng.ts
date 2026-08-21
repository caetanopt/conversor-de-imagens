/**
 * Gera um PNG valido de dimensoes arbitrarias, sem usar canvas.
 *
 * Existe para a pagina de diagnostico poder medir imagens grandes em qualquer
 * dispositivo, incluindo um telemovel. Duas razoes para nao usar canvas:
 *
 *  1. os browsers limitam a area maxima de um canvas, e o Safari em iOS e o
 *     mais restritivo. Se a fonte fosse um canvas, o limite medido seria o do
 *     canvas e nao o do motor, o que confundiria a medicao;
 *  2. um canvas de 24 MP ocupa cerca de 96 MB na main thread antes de a
 *     conversao comecar, o que enviesa exatamente aquilo que queremos medir.
 *
 * As linhas sao produzidas em streaming e comprimidas a medida que sao geradas,
 * por isso o pico de memoria de quem gera fica em poucos megabytes mesmo para
 * uma imagem de 24 MP.
 */

const ASSINATURA_PNG: Uint8Array<ArrayBuffer> = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const TABELA_CRC = (() => {
  const tabela = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    tabela[n] = c >>> 0
  }
  return tabela
})()

function crc32(bytes: Uint8Array<ArrayBuffer>): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) {
    c = TABELA_CRC[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function chunk(tipo: string, dados: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const saida = new Uint8Array(12 + dados.length)
  const vista = new DataView(saida.buffer)
  vista.setUint32(0, dados.length)
  for (let i = 0; i < 4; i += 1) saida[4 + i] = tipo.charCodeAt(i)
  saida.set(dados, 8)
  vista.setUint32(8 + dados.length, crc32(saida.subarray(4, 8 + dados.length)))
  return saida
}

/** IHDR: dimensoes, 8 bits por canal, cor tipo 2 (RGB truecolor), sem entrelacar. */
function ihdr(largura: number, altura: number): Uint8Array<ArrayBuffer> {
  const dados = new Uint8Array(13)
  const vista = new DataView(dados.buffer)
  vista.setUint32(0, largura)
  vista.setUint32(4, altura)
  dados[8] = 8
  dados[9] = 2
  return chunk('IHDR', dados)
}

/**
 * Conteudo com variacao suficiente para a compressao nao ser irrealista.
 * Um PNG de cor solida comprimiria para quase nada e daria tempos de encode
 * que nao se parecem com uma fotografia.
 */
function preencherLinha(linha: Uint8Array<ArrayBuffer>, y: number, largura: number): void {
  linha[0] = 0 // byte de filtro: nenhum
  for (let x = 0; x < largura; x += 1) {
    const i = 1 + x * 3
    linha[i] = (x * 7 + y * 3) & 0xff
    linha[i + 1] = (x * 3 + y * 11 + ((x ^ y) & 0x3f)) & 0xff
    linha[i + 2] = (x + y * 5 + ((x * y) & 0x1f)) & 0xff
  }
}

/**
 * Devolve um Blob com um PNG das dimensoes pedidas.
 *
 * Requer CompressionStream, disponivel em Chrome 80, Firefox 113 e Safari 16.4.
 * A pagina de diagnostico verifica isso antes de chamar.
 */
export async function gerarPngGrande(largura: number, altura: number): Promise<Blob> {
  if (typeof CompressionStream !== 'function') {
    throw new Error('CompressionStream indisponivel neste browser')
  }

  const bytesPorLinha = 1 + largura * 3
  let y = 0

  // Tipado como BufferSource porque e isso que CompressionStream.writable
  // aceita, e a variancia dos tipos de stream nao permite Uint8Array aqui.
  const linhas = new ReadableStream<BufferSource>({
    pull(controlador) {
      if (y >= altura) {
        controlador.close()
        return
      }
      // Um lote de linhas por chamada mantem o numero de chunks razoavel sem
      // acumular a imagem inteira em memoria.
      const lote = Math.max(1, Math.min(64, altura - y))
      const bloco = new Uint8Array(bytesPorLinha * lote)
      for (let i = 0; i < lote; i += 1) {
        preencherLinha(bloco.subarray(i * bytesPorLinha, (i + 1) * bytesPorLinha), y + i, largura)
      }
      y += lote
      controlador.enqueue(bloco)
    },
  })

  // 'deflate' produz um fluxo zlib, que e exatamente o que o IDAT espera.
  const comprimido = await new Response(
    linhas.pipeThrough(new CompressionStream('deflate')),
  ).arrayBuffer()

  return new Blob(
    [
      ASSINATURA_PNG,
      ihdr(largura, altura),
      chunk('IDAT', new Uint8Array(comprimido)),
      chunk('IEND', new Uint8Array(0)),
    ],
    { type: 'image/png' },
  )
}

/** Empacota o PNG como File, que e o que o resto da aplicacao consome. */
export async function gerarFicheiroDeTeste(largura: number, altura: number): Promise<File> {
  const blob = await gerarPngGrande(largura, altura)
  return new File([blob], `teste-${largura}x${altura}.png`, { type: 'image/png' })
}
