/**
 * Leitura dos tokens de cor a partir do CSS.
 *
 * Le o ficheiro em vez de duplicar os valores num objeto TypeScript, para o
 * teste de contraste falhar quando alguem editar o CSS. Uma copia dos valores
 * envelheceria em silencio, que e exatamente o problema que este teste existe
 * para evitar.
 *
 * Resolve tambem as referencias `var(--x)`, porque os tokens semanticos
 * apontam para a paleta da marca em vez de repetirem os valores. Sem esta
 * resolucao o teste de contraste mediria a string `var(--marca-azul-profundo)`
 * e nao a cor que o browser desenha.
 */

export type TemaDeCores = Readonly<Record<string, string>>

/** Nome de cada bloco de declaracoes do ficheiro, na ordem em que aparece. */
const BLOCOS = {
  claro: ':root {',
  escuroPorPreferencia: ":root:not([data-tema='claro']) {",
  escuroPorEscolha: ":root[data-tema='escuro'] {",
} as const

export type NomeDeBloco = keyof typeof BLOCOS

/**
 * Os tres blocos de tokens, ja com `var()` resolvido.
 *
 * `claro` e o bloco base. Os dois blocos escuros herdam o claro e redefinem
 * apenas o que muda, portanto cada um e a fusao com o base. Existem em
 * separado para que um teste possa confirmar que declaram o mesmo: sao
 * duplicados de proposito, e a duplicacao precisa de guarda.
 */
export function lerTemas(css: string): Record<NomeDeBloco, TemaDeCores> {
  const claro = declaracoes(bloco(css, BLOCOS.claro))
  const porPreferencia = declaracoes(bloco(css, BLOCOS.escuroPorPreferencia))
  const porEscolha = declaracoes(bloco(css, BLOCOS.escuroPorEscolha))

  return {
    claro: resolver(claro),
    escuroPorPreferencia: resolver({ ...claro, ...porPreferencia }),
    escuroPorEscolha: resolver({ ...claro, ...porEscolha }),
  }
}

/** Apenas as declaracoes proprias de um bloco, sem heranca nem resolucao. */
export function lerBloco(css: string, nome: NomeDeBloco): TemaDeCores {
  return declaracoes(bloco(css, BLOCOS[nome]))
}

/**
 * O corpo do bloco que comeca no seletor dado, contando chaves.
 *
 * Contar chaves e necessario porque o bloco escuro por preferencia esta dentro
 * de uma media query: cortar no primeiro `}` levaria metade das declaracoes.
 */
function bloco(css: string, seletor: string): string {
  const inicio = css.indexOf(seletor)
  if (inicio === -1) throw new Error(`bloco ${seletor} nao existe em tokens.css`)

  let profundidade = 0
  const abre = inicio + seletor.length - 1
  for (let i = abre; i < css.length; i += 1) {
    if (css[i] === '{') profundidade += 1
    else if (css[i] === '}') {
      profundidade -= 1
      if (profundidade === 0) return css.slice(abre + 1, i)
    }
  }
  throw new Error(`bloco ${seletor} nao fecha`)
}

function declaracoes(css: string): Record<string, string> {
  const encontrados: Record<string, string> = {}
  const padrao = /--([a-z0-9-]+)\s*:\s*([^;]+);/g
  let m: RegExpExecArray | null
  while ((m = padrao.exec(css)) !== null) {
    encontrados[`--${m[1]}`] = m[2]!.trim()
  }
  return encontrados
}

/**
 * Substitui `var(--x)` pelo valor de `--x`, repetidamente.
 *
 * Uma referencia pode apontar para outra referencia, por isso corre em ciclo.
 * O limite existe para nao ficar preso num ciclo de referencias: se acontecer,
 * o valor fica com o `var()` la dentro e o teste de contraste falha a dizer
 * que nao e uma cor, que e o resultado correto.
 */
function resolver(tokens: Record<string, string>): TemaDeCores {
  const resolvidos = { ...tokens }
  const referencia = /var\(\s*(--[a-z0-9-]+)\s*\)/g

  for (let passagem = 0; passagem < 10; passagem += 1) {
    let mudou = false
    for (const [nome, valor] of Object.entries(resolvidos)) {
      if (!valor.includes('var(')) continue
      const novo = valor.replace(referencia, (inteiro, alvo: string) => resolvidos[alvo] ?? inteiro)
      if (novo !== valor) {
        resolvidos[nome] = novo
        mudou = true
      }
    }
    if (!mudou) break
  }
  return resolvidos
}
