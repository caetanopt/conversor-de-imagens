/**
 * Leitura de ficheiros do utilizador.
 *
 * O `File` e um apontador para o disco, nao bytes em memoria. Por isso lemos
 * de novo a cada operacao em vez de guardar o ArrayBuffer entre a inspecao e
 * a conversao: uma imagem de 100 MB nao fica retida em memoria durante os
 * minutos em que o utilizador esta a escolher definicoes.
 *
 * Alem disso, os buffers sao transferidos para o worker e ficam destacados na
 * origem, portanto reutilizar um buffer ja enviado nao seria possivel.
 */
export async function lerComoBuffer(file: File): Promise<ArrayBuffer> {
  return file.arrayBuffer()
}

/** Le apenas o inicio do ficheiro, para verificar a assinatura real. */
export async function lerCabecalho(file: File, bytes = 32): Promise<Uint8Array> {
  const fatia = file.slice(0, bytes)
  return new Uint8Array(await fatia.arrayBuffer())
}
