/**
 * Leitura dos tokens de cor a partir do CSS.
 *
 * Le o ficheiro em vez de duplicar os valores num objeto TypeScript, para o
 * teste de contraste falhar quando alguem editar o CSS. Uma copia dos valores
 * envelheceria em silencio, que e exatamente o problema que este teste existe
 * para evitar.
 */

export type TemaDeCores = Readonly<Record<string, string>>

/**
 * Extrai as declaracoes de custom properties de um bloco de CSS.
 *
 * O tema claro esta em `:root` no topo do ficheiro e o escuro dentro de
 * `@media (prefers-color-scheme: dark)`. O escuro herda o claro e so redefine
 * o que muda, portanto o resultado do escuro e a fusao dos dois.
 */
export function lerTemas(css: string): {
  readonly claro: TemaDeCores
  readonly escuro: TemaDeCores
} {
  const marcaEscuro = css.indexOf('@media (prefers-color-scheme: dark)')
  const parteClara = marcaEscuro === -1 ? css : css.slice(0, marcaEscuro)
  const parteEscura = marcaEscuro === -1 ? '' : css.slice(marcaEscuro)

  const claro = declaracoes(parteClara)
  return { claro, escuro: { ...claro, ...declaracoes(parteEscura) } }
}

function declaracoes(css: string): TemaDeCores {
  const encontrados: Record<string, string> = {}
  const padrao = /--([a-z0-9-]+)\s*:\s*([^;]+);/g
  let m: RegExpExecArray | null
  while ((m = padrao.exec(css)) !== null) {
    encontrados[`--${m[1]}`] = m[2]!.trim()
  }
  return encontrados
}
