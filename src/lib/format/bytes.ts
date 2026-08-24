/** Formatacao de tamanhos em Portugues de Portugal, com virgula decimal. */
const UNIDADES = ['B', 'KB', 'MB', 'GB'] as const

export function formatarBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes === 0) return '0 B'

  let valor = bytes
  let indice = 0
  while (valor >= 1024 && indice < UNIDADES.length - 1) {
    valor /= 1024
    indice += 1
  }

  const decimais = indice === 0 ? 0 : valor < 10 ? 2 : 1
  const numero = new Intl.NumberFormat('pt-PT', {
    minimumFractionDigits: decimais,
    maximumFractionDigits: decimais,
  }).format(valor)

  return `${numero} ${UNIDADES[indice]}`
}

export function formatarDimensoes(largura: number, altura: number): string {
  const n = new Intl.NumberFormat('pt-PT')
  return `${n.format(largura)} x ${n.format(altura)}`
}

export function formatarMegapixels(largura: number, altura: number): string {
  const pixels = largura * altura
  const mp = pixels / 1_000_000

  // Abaixo de 0,05 MP o valor arredondado seria "0,0 MP", que nao informa nada
  // e parece uma avaria. Um icone de 240x160 sao 38 400 pixels: dizer isso e
  // mais util do que dizer zero.
  if (mp < 0.05) {
    return `${new Intl.NumberFormat('pt-PT').format(pixels)} pixels`
  }

  const decimais = mp < 10 ? 1 : 0
  return `${new Intl.NumberFormat('pt-PT', {
    minimumFractionDigits: decimais,
    maximumFractionDigits: decimais,
  }).format(mp)} MP`
}

export function formatarDuracao(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  const segundos = ms / 1000
  return `${new Intl.NumberFormat('pt-PT', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(segundos)} s`
}
