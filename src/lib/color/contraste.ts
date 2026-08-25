/**
 * Contraste de cor, calculado a partir dos tokens.
 *
 * Existe porque a secção 20.8 do CLAUDE.md exige contraste suficiente e isso
 * nao se verifica a olho. Os tokens sao provisorios, mas um problema
 * estrutural de contraste sobrevive a troca de cores: se o texto sobre a
 * superficie for feito com uma diferenca de luminosidade pequena, a marca nova
 * herda o problema.
 *
 * Sem dependencias. A conversao de oklch para sRGB e matematica fechada e
 * publicada, e esta validada por testes contra valores conhecidos.
 */

export type Rgb = { readonly r: number; readonly g: number; readonly b: number }

/** Cor num token: `oklch(52% 0.16 250)`, com alfa opcional que ignoramos. */
const OKLCH = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*[\d.]+\s*)?\)$/

export function parseOklch(valor: string): { l: number; c: number; h: number } | null {
  const m = OKLCH.exec(valor.trim())
  if (!m) return null
  return { l: Number(m[1]) / 100, c: Number(m[2]), h: Number(m[3]) }
}

/**
 * oklch para sRGB, com os coeficientes da especificacao.
 *
 * oklch para oklab e polar para cartesiano; oklab para LMS lineares; LMS para
 * sRGB linear; e por fim a transferencia de gama do sRGB.
 */
export function oklchParaRgb({ l, c, h }: { l: number; c: number; h: number }): Rgb {
  const rad = (h * Math.PI) / 180
  const a = c * Math.cos(rad)
  const b = c * Math.sin(rad)

  const lRaiz = l + 0.3963377774 * a + 0.2158037573 * b
  const mRaiz = l - 0.1055613458 * a - 0.0638541728 * b
  const sRaiz = l - 0.0894841775 * a - 1.291485548 * b

  const lLinear = lRaiz ** 3
  const mLinear = mRaiz ** 3
  const sLinear = sRaiz ** 3

  return {
    r: gama(4.0767416621 * lLinear - 3.3077115913 * mLinear + 0.2309699292 * sLinear),
    g: gama(-1.2684380046 * lLinear + 2.6097574011 * mLinear - 0.3413193965 * sLinear),
    b: gama(-0.0041960863 * lLinear - 0.7034186147 * mLinear + 1.707614701 * sLinear),
  }
}

/** Transferencia de gama do sRGB, com o resultado limitado a [0, 1]. */
function gama(linear: number): number {
  const v = linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055
  return Math.min(1, Math.max(0, v))
}

/** Luminancia relativa, WCAG 2.x. */
export function luminancia({ r, g, b }: Rgb): number {
  const canal = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
}

/** Razao de contraste WCAG, entre 1 e 21. */
export function contraste(a: Rgb, b: Rgb): number {
  const la = luminancia(a)
  const lb = luminancia(b)
  const claro = Math.max(la, lb)
  const escuro = Math.min(la, lb)
  return (claro + 0.05) / (escuro + 0.05)
}

/** Contraste entre dois valores de token, ou null se algum nao for oklch. */
export function contrasteEntreTokens(a: string, b: string): number | null {
  const ca = parseOklch(a)
  const cb = parseOklch(b)
  if (!ca || !cb) return null
  return contraste(oklchParaRgb(ca), oklchParaRgb(cb))
}

/**
 * Limiares da WCAG 2.2 AA.
 *
 * 'texto'         4.5:1, texto normal
 * 'texto-grande'  3:1, a partir de 18.66px negrito ou 24px
 * 'componente'    3:1, limites de controlos e objetos graficos (1.4.11)
 */
export const LIMIARES = {
  texto: 4.5,
  'texto-grande': 3,
  componente: 3,
} as const

export type TipoDeContraste = keyof typeof LIMIARES
