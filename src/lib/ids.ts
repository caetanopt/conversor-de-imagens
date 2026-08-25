/**
 * Identificadores de trabalho.
 *
 * Existe por uma razao concreta: `crypto.randomUUID` so esta disponivel em
 * contexto seguro. Numa pagina servida por HTTP simples, que e exatamente o
 * caso de testar num telefone pelo IP da rede local, a funcao e `undefined`.
 *
 * Sem alternativa, `criarJob` lancava, o erro subia como rejeicao nao tratada e
 * selecionar um ficheiro nao fazia nada: sem mensagem, sem estado de erro, sem
 * pista nenhuma para o utilizador. O caminho mais provavel para validar a
 * aplicacao num dispositivo real era tambem o unico onde ela nao arrancava.
 *
 * `crypto.getRandomValues`, ao contrario de `randomUUID` e de `crypto.subtle`,
 * nao esta limitado a contexto seguro, portanto a alternativa continua a usar
 * aleatoriedade do proprio browser.
 */

/** Identificador unico. Nunca derivado do nome do ficheiro. CLAUDE.md, seccao 10. */
export function novoId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return uuidDeBytes(bytesAleatorios(16))
}

function bytesAleatorios(quantidade: number): Uint8Array {
  const bytes = new Uint8Array(quantidade)

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
    return bytes
  }

  // Ultimo recurso, para ambientes sem `crypto` nenhum. Estes identificadores
  // servem para distinguir linhas de uma lista, nao para seguranca, portanto
  // `Math.random` e suficiente aqui e nao e usado em mais nada.
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  return bytes
}

/** Formato de UUID v4, para os ids serem indistinguiveis entre os dois caminhos. */
function uuidDeBytes(bytes: Uint8Array): string {
  const b = new Uint8Array(bytes)
  b[6] = (b[6]! & 0x0f) | 0x40
  b[8] = (b[8]! & 0x3f) | 0x80

  const hex = Array.from(b, (valor) => valor.toString(16).padStart(2, '0'))
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-')
}
