/**
 * Geometria do corte.
 *
 * Tudo o que uma ferramenta de corte faz de errado acontece aqui, e nao no
 * componente: um manipulo que puxa a borda errada, uma proporcao que se perde
 * ao encostar ao limite, um retangulo que sai da imagem, um lado que passa para
 * o outro quando se arrasta demasiado. Por isso a matematica vive num modulo
 * puro, testavel sem montar interface nem arrastar um rato.
 *
 * As coordenadas sao SEMPRE pixeis da imagem de origem depois da orientacao
 * automatica, nunca pixeis do ecra. A pre-visualizacao e uma miniatura de
 * algumas centenas de pixeis; guardar coordenadas de ecra faria o corte mudar
 * quando a janela muda de tamanho. A conversao entre os dois espacos e feita na
 * fronteira, por `paraEcra` e `paraImagem`.
 *
 * Porque depois da orientacao automatica: medido num JPEG com EXIF
 * orientation=6, cortar antes de orientar devolve 80x120 quando se pediu 120x80,
 * e de outra regiao da imagem. Ver docs/medicoes.md.
 */

export type CropRect = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type Limites = {
  readonly width: number
  readonly height: number
}

/**
 * Manipulos, pelos pontos cardeais.
 *
 * Cada um manda nas bordas que toca: 'noroeste' move a esquerda e o topo,
 * 'norte' so o topo. E a mesma convencao da gravidade do motor, o que evita
 * traduzir entre dois vocabularios.
 */
export type Manipulo =
  | 'noroeste'
  | 'norte'
  | 'nordeste'
  | 'oeste'
  | 'este'
  | 'sudoeste'
  | 'sul'
  | 'sudeste'

export type ProporcaoId = 'livre' | 'original' | '1:1' | '4:5' | '3:2' | '16:9' | '9:16'

export type Proporcao = {
  readonly id: ProporcaoId
  readonly label: string
  /** Largura dividida pela altura, ou null quando a proporcao e livre. */
  readonly valor: number | null
}

/**
 * As proporcoes oferecidas.
 *
 * Nao e a lista do Photoshop copiada: sao as que fazem sentido para quem prepara
 * imagens para web e redes. 'original' e calculada a partir da imagem, por isso
 * o valor fica null e resolve-se em `valorDaProporcao`.
 */
export const PROPORCOES: readonly Proporcao[] = [
  { id: 'livre', label: 'Livre', valor: null },
  { id: 'original', label: 'Original', valor: null },
  { id: '1:1', label: '1:1', valor: 1 },
  { id: '4:5', label: '4:5', valor: 4 / 5 },
  { id: '3:2', label: '3:2', valor: 3 / 2 },
  { id: '16:9', label: '16:9', valor: 16 / 9 },
  { id: '9:16', label: '9:16', valor: 9 / 16 },
] as const

/** Lado minimo de um corte, em pixeis da origem. */
export const CORTE_MINIMO = 1

export function proporcaoPorId(id: ProporcaoId): Proporcao {
  const encontrada = PROPORCOES.find((p) => p.id === id)
  if (!encontrada) throw new Error(`proporcao desconhecida: ${id}`)
  return encontrada
}

/** Resolve a proporcao em numero, incluindo 'original', que depende da imagem. */
export function valorDaProporcao(id: ProporcaoId, limites: Limites): number | null {
  if (id === 'original') {
    if (limites.height <= 0) return null
    return limites.width / limites.height
  }
  return proporcaoPorId(id).valor
}

/** Trava o retangulo dentro da imagem, sem lhe mudar as dimensoes se nao for preciso. */
export function limitarCorte(rect: CropRect, limites: Limites): CropRect {
  const width = Math.max(CORTE_MINIMO, Math.min(Math.round(rect.width), limites.width))
  const height = Math.max(CORTE_MINIMO, Math.min(Math.round(rect.height), limites.height))
  const x = Math.max(0, Math.min(Math.round(rect.x), limites.width - width))
  const y = Math.max(0, Math.min(Math.round(rect.y), limites.height - height))
  return { x, y, width, height }
}

/**
 * O maior retangulo com esta proporcao que cabe na imagem, centrado.
 *
 * E o que o Photoshop faz quando se escolhe uma proporcao com a ferramenta
 * ativa: nao encolhe o corte para um canto, ocupa o que pode.
 */
export function corteParaProporcao(limites: Limites, proporcao: number | null): CropRect {
  if (proporcao === null || !Number.isFinite(proporcao) || proporcao <= 0) {
    return { x: 0, y: 0, width: limites.width, height: limites.height }
  }

  const larguraSeAlturaCheia = limites.height * proporcao
  const rect =
    larguraSeAlturaCheia <= limites.width
      ? { width: larguraSeAlturaCheia, height: limites.height }
      : { width: limites.width, height: limites.width / proporcao }

  return limitarCorte(
    {
      x: (limites.width - rect.width) / 2,
      y: (limites.height - rect.height) / 2,
      width: rect.width,
      height: rect.height,
    },
    limites,
  )
}

/** Corte inicial: a imagem inteira. O utilizador reduz a partir dai. */
export function corteInicial(limites: Limites): CropRect {
  return { x: 0, y: 0, width: limites.width, height: limites.height }
}

/** Desloca o corte, travando nas bordas em vez de o deixar sair. */
export function moverCorte(rect: CropRect, dx: number, dy: number, limites: Limites): CropRect {
  return limitarCorte({ ...rect, x: rect.x + dx, y: rect.y + dy }, limites)
}

type Bordas = { esquerda: number; topo: number; direita: number; fundo: number }

const BORDAS_DO_MANIPULO: Record<Manipulo, { x: -1 | 0 | 1; y: -1 | 0 | 1 }> = {
  noroeste: { x: -1, y: -1 },
  norte: { x: 0, y: -1 },
  nordeste: { x: 1, y: -1 },
  oeste: { x: -1, y: 0 },
  este: { x: 1, y: 0 },
  sudoeste: { x: -1, y: 1 },
  sul: { x: 0, y: 1 },
  sudeste: { x: 1, y: 1 },
}

/**
 * Arrasta um manipulo.
 *
 * Com proporcao livre cada manipulo mexe apenas nas suas bordas. Se o
 * utilizador arrastar para alem do lado oposto, as bordas trocam em vez de o
 * retangulo colapsar, que e o comportamento do Photoshop e o que a mao espera.
 *
 * Com proporcao travada, a borda arrastada manda e a outra dimensao e recalculada
 * a partir da ancora, que e sempre o canto ou o lado oposto ao manipulo. Sem
 * ancora fixa, arrastar um canto fazia o retangulo fugir pelo ecra.
 */
export function redimensionarPorManipulo(
  rect: CropRect,
  manipulo: Manipulo,
  dx: number,
  dy: number,
  limites: Limites,
  proporcao: number | null,
): CropRect {
  const dir = BORDAS_DO_MANIPULO[manipulo]
  const b: Bordas = {
    esquerda: rect.x,
    topo: rect.y,
    direita: rect.x + rect.width,
    fundo: rect.y + rect.height,
  }

  if (dir.x === -1) b.esquerda += dx
  if (dir.x === 1) b.direita += dx
  if (dir.y === -1) b.topo += dy
  if (dir.y === 1) b.fundo += dy

  // Passou para o outro lado: as bordas trocam, o retangulo continua valido.
  const semProporcao: CropRect = {
    x: Math.min(b.esquerda, b.direita),
    y: Math.min(b.topo, b.fundo),
    width: Math.abs(b.direita - b.esquerda),
    height: Math.abs(b.fundo - b.topo),
  }

  if (proporcao === null || !Number.isFinite(proporcao) || proporcao <= 0) {
    return limitarCorte(semProporcao, limites)
  }

  return comProporcao(semProporcao, manipulo, limites, proporcao)
}

/**
 * Impoe a proporcao a um retangulo, ancorado no lado oposto ao manipulo.
 *
 * Um manipulo de canto usa a dimensao que mais cresceu, para o corte acompanhar
 * o gesto em vez de resistir. Um manipulo de lado tem uma dimensao livre e a
 * outra calculada, e cresce simetricamente no eixo livre: puxar 'oeste' com
 * proporcao travada tem de mudar tambem a altura, e mudá-la para os dois lados
 * mantem o corte onde estava.
 */
function comProporcao(
  rect: CropRect,
  manipulo: Manipulo,
  limites: Limites,
  proporcao: number,
): CropRect {
  const dir = BORDAS_DO_MANIPULO[manipulo]

  let width = rect.width
  let height = rect.height

  if (dir.x !== 0 && dir.y !== 0) {
    // Canto: manda a dimensao que exige o maior retangulo.
    if (width / proporcao >= height) height = width / proporcao
    else width = height * proporcao
  } else if (dir.x !== 0) {
    height = width / proporcao
  } else {
    width = height * proporcao
  }

  // Nunca maior do que a imagem, mantendo a proporcao.
  if (width > limites.width) {
    width = limites.width
    height = width / proporcao
  }
  if (height > limites.height) {
    height = limites.height
    width = height * proporcao
  }

  // A ancora e a borda que o manipulo NAO move.
  const x =
    dir.x === -1
      ? rect.x + rect.width - width // ancora a direita
      : dir.x === 1
        ? rect.x // ancora a esquerda
        : rect.x + (rect.width - width) / 2 // eixo livre: cresce dos dois lados
  const y =
    dir.y === -1
      ? rect.y + rect.height - height
      : dir.y === 1
        ? rect.y
        : rect.y + (rect.height - height) / 2

  return limitarCorte({ x, y, width, height }, limites)
}

/**
 * Escreve dimensoes a mao, mantendo o corte ancorado no seu centro.
 *
 * Ancorado no centro e nao no canto superior esquerdo: escrever uma largura
 * menor num corte centrado deve manter o enquadramento, nao empurrar a imagem
 * para a esquerda.
 */
export function definirDimensoes(
  rect: CropRect,
  width: number | null,
  height: number | null,
  limites: Limites,
  proporcao: number | null,
): CropRect {
  let w = width ?? rect.width
  let h = height ?? rect.height

  if (proporcao !== null && Number.isFinite(proporcao) && proporcao > 0) {
    // A dimensao escrita manda; a outra segue a proporcao.
    if (width !== null) h = w / proporcao
    else if (height !== null) w = h * proporcao
  }

  const centroX = rect.x + rect.width / 2
  const centroY = rect.y + rect.height / 2
  return limitarCorte({ x: centroX - w / 2, y: centroY - h / 2, width: w, height: h }, limites)
}

/** Troca largura por altura, mantendo o centro. Espelha o botao do Photoshop. */
export function trocarDimensoes(rect: CropRect, limites: Limites): CropRect {
  const centroX = rect.x + rect.width / 2
  const centroY = rect.y + rect.height / 2
  return limitarCorte(
    {
      x: centroX - rect.height / 2,
      y: centroY - rect.width / 2,
      width: rect.height,
      height: rect.width,
    },
    limites,
  )
}

/** True quando o corte cobre a imagem toda, ou seja nao corta nada. */
export function corteEInteiro(rect: CropRect, limites: Limites): boolean {
  return (
    rect.x === 0 &&
    rect.y === 0 &&
    rect.width === limites.width &&
    rect.height === limites.height
  )
}

/** Proporcao do retangulo, arredondada, para mostrar ao utilizador. */
export function proporcaoDoCorte(rect: CropRect): string {
  if (rect.height === 0) return '—'
  const razao = rect.width / rect.height
  const conhecida = PROPORCOES.find(
    (p) => p.valor !== null && Math.abs(p.valor - razao) < 0.005,
  )
  return conhecida ? conhecida.label : razao.toFixed(2).replace('.', ',')
}
