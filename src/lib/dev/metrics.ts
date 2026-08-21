/**
 * Metricas internas, apenas em desenvolvimento.
 *
 * Nunca sai do dispositivo, nunca inclui nome de ficheiro nem metadados da
 * imagem, e nao existe nenhum destino de rede. Serve para responder a
 * "isto esta lento?" durante o desenvolvimento.
 * CLAUDE.md, seccao 19.
 */
const ativo = process.env.NODE_ENV === 'development'

export type MetricaConversao = {
  readonly formatoOrigem: string
  readonly formatoDestino: string
  readonly pixels: number
  readonly bytesOrigem: number
  readonly bytesDestino: number
  readonly duracaoMs: number
}

export function registarArranqueDoMotor(initMs: number, versao: string): void {
  if (!ativo) return
  console.warn(`[motor] arranque ${initMs} ms | ${versao}`)
}

export function registarConversao(m: MetricaConversao): void {
  if (!ativo) return
  const reducao = (((m.bytesOrigem - m.bytesDestino) / m.bytesOrigem) * 100).toFixed(1)
  console.warn(
    `[conversao] ${m.formatoOrigem} -> ${m.formatoDestino} | ` +
      `${(m.pixels / 1_000_000).toFixed(1)} MP | ${m.duracaoMs} ms | ${reducao} %`,
  )
}

export function registarFalha(formatoDestino: string, kind: string): void {
  if (!ativo) return
  console.warn(`[falha] destino ${formatoDestino} | ${kind}`)
}
