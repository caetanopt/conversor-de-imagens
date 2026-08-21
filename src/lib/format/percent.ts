/**
 * Comparacao de tamanho antes e depois.
 *
 * Um aumento de tamanho nunca e escondido nem arredondado para zero.
 * CLAUDE.md, seccao 24.
 */
import type { SizeComparison } from '@/features/converter/types'

export function compararTamanhos(originalSize: number, outputSize: number): SizeComparison {
  const deltaBytes = outputSize - originalSize
  const savingPercent =
    originalSize > 0 ? ((originalSize - outputSize) / originalSize) * 100 : 0

  return {
    originalSize,
    outputSize,
    deltaBytes,
    savingPercent,
    direction: deltaBytes < 0 ? 'reduziu' : deltaBytes > 0 ? 'aumentou' : 'igual',
  }
}

/** Sempre com sinal explicito, para o utilizador nao ter de interpretar. */
export function formatarVariacao(comparacao: SizeComparison): string {
  if (comparacao.direction === 'igual') return 'sem alteração'

  const magnitude = Math.abs(comparacao.savingPercent)
  // Uma reducao real mas inferior a 0,1 % nao deve aparecer como 0 %.
  const decimais = magnitude > 0 && magnitude < 0.1 ? 2 : magnitude < 10 ? 1 : 0
  const numero = new Intl.NumberFormat('pt-PT', {
    minimumFractionDigits: decimais,
    maximumFractionDigits: decimais,
  }).format(magnitude)

  return comparacao.direction === 'reduziu' ? `menos ${numero} %` : `mais ${numero} %`
}
