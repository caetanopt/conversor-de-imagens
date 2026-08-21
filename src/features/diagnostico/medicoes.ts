'use client'

/**
 * Baterias de medicao que a pagina de diagnostico corre.
 *
 * Usam o mesmo EngineClient que o produto, para os numeros descreverem o
 * caminho real e nao um atalho de teste.
 */
import { LIMITES } from '@/config/limits'
import { opcoesPorDefeito } from '@/features/converter/state/jobsReducer'
import type { FormatId } from '@/config/formats'
import { gerarFicheiroDeTeste } from '@/lib/dev/gerarPng'
import { lerMemoria, type LeituraDeMemoria } from '@/lib/dev/capacidades'
import { ErroDoMotor, type EngineClient } from '@/lib/image-engine/client/EngineClient'

export type DegrauDeMemoria = {
  readonly etiqueta: string
  readonly largura: number
  readonly altura: number
  readonly megapixels: number
  readonly bytesOrigem: number
  readonly formatoOrigem: 'PNG'
  readonly destino: FormatId
  readonly resultado: 'ok' | 'falhou' | 'nao-tentado'
  readonly erro: string | null
  readonly decodeMs: number | null
  readonly encodeMs: number | null
  readonly totalMs: number | null
  readonly bytesSaida: number | null
  readonly memoriaAntes: LeituraDeMemoria
  readonly memoriaDepois: LeituraDeMemoria
}

/**
 * Escada de dimensoes.
 *
 * A informacao que interessa nao e um numero de memoria, que nenhum browser
 * expoe para o WASM, e o degrau em que a conversao deixa de funcionar. Por isso
 * a escada sobe ate falhar e para.
 */
export const ESCADA: readonly { etiqueta: string; largura: number; altura: number }[] = [
  { etiqueta: '0,5 MP', largura: 800, altura: 600 },
  { etiqueta: '1 MP', largura: 1200, altura: 900 },
  { etiqueta: '2 MP', largura: 1600, altura: 1200 },
  { etiqueta: '4 MP', largura: 2400, altura: 1600 },
  { etiqueta: '8 MP', largura: 3500, altura: 2300 },
  { etiqueta: '12 MP', largura: 4200, altura: 2800 },
  { etiqueta: '16 MP', largura: 4900, altura: 3266 },
  { etiqueta: '24 MP', largura: 6000, altura: 4000 },
  { etiqueta: '40 MP', largura: 7746, altura: 5164 },
  { etiqueta: '60 MP', largura: 9486, altura: 6324 },
  { etiqueta: '100 MP', largura: 12_247, altura: 8165 },
]

export type Progresso = (mensagem: string) => void

export async function correrEscadaDeMemoria(
  cliente: EngineClient,
  destino: FormatId,
  progresso: Progresso,
): Promise<readonly DegrauDeMemoria[]> {
  const resultados: DegrauDeMemoria[] = []
  let jaFalhou = false

  for (const degrau of ESCADA) {
    const megapixels = Number(((degrau.largura * degrau.altura) / 1_000_000).toFixed(1))

    if (jaFalhou) {
      resultados.push(vazio(degrau, megapixels, destino, 'nao-tentado', null))
      continue
    }

    progresso(`A gerar ${degrau.etiqueta}...`)
    let ficheiro: File
    try {
      ficheiro = await gerarFicheiroDeTeste(degrau.largura, degrau.altura)
    } catch (erro) {
      resultados.push(vazio(degrau, megapixels, destino, 'falhou', mensagem(erro)))
      jaFalhou = true
      continue
    }

    progresso(`A converter ${degrau.etiqueta} para ${destino}...`)
    const memoriaAntes = lerMemoria()

    try {
      const r = await cliente.convert(ficheiro, { ...opcoesPorDefeito(destino) })
      resultados.push({
        etiqueta: degrau.etiqueta,
        largura: degrau.largura,
        altura: degrau.altura,
        megapixels,
        bytesOrigem: ficheiro.size,
        formatoOrigem: 'PNG',
        destino,
        resultado: 'ok',
        erro: null,
        decodeMs: r.decodeMs,
        encodeMs: r.encodeMs,
        totalMs: r.durationMs,
        bytesSaida: r.size,
        memoriaAntes,
        memoriaDepois: lerMemoria(),
      })
    } catch (erro) {
      resultados.push({
        ...vazio(degrau, megapixels, destino, 'falhou', mensagem(erro)),
        bytesOrigem: ficheiro.size,
        memoriaAntes,
        memoriaDepois: lerMemoria(),
      })
      // Depois de uma falha, os degraus seguintes nao acrescentam informacao e
      // arriscam deixar o separador sem memoria.
      jaFalhou = true
    }
  }

  return resultados
}

function vazio(
  degrau: { etiqueta: string; largura: number; altura: number },
  megapixels: number,
  destino: FormatId,
  resultado: DegrauDeMemoria['resultado'],
  erro: string | null,
): DegrauDeMemoria {
  return {
    etiqueta: degrau.etiqueta,
    largura: degrau.largura,
    altura: degrau.altura,
    megapixels,
    bytesOrigem: 0,
    formatoOrigem: 'PNG',
    destino,
    resultado,
    erro,
    decodeMs: null,
    encodeMs: null,
    totalMs: null,
    bytesSaida: null,
    memoriaAntes: null,
    memoriaDepois: null,
  }
}

// ------------------------------------------------------------------ qualidade

export type PontoDeQualidade = {
  readonly destino: FormatId
  readonly qualidade: number
  readonly bytesSaida: number
  readonly reducaoPercent: number
  readonly decodeMs: number
  readonly encodeMs: number
  readonly totalMs: number
}

export const QUALIDADES: readonly number[] = [60, 75, 82, 90, 100]

export async function correrVarreduraDeQualidade(
  cliente: EngineClient,
  origem: File,
  destinos: readonly FormatId[],
  progresso: Progresso,
): Promise<readonly PontoDeQualidade[]> {
  const pontos: PontoDeQualidade[] = []

  for (const destino of destinos) {
    for (const qualidade of QUALIDADES) {
      progresso(`${destino} a qualidade ${qualidade}...`)
      const r = await cliente.convert(origem, { ...opcoesPorDefeito(destino), quality: qualidade, preset: null })
      pontos.push({
        destino,
        qualidade,
        bytesSaida: r.size,
        reducaoPercent: Number((((origem.size - r.size) / origem.size) * 100).toFixed(1)),
        decodeMs: r.decodeMs,
        encodeMs: r.encodeMs,
        totalMs: r.durationMs,
      })
    }
  }

  return pontos
}

// ------------------------------------------------------------- mesmo formato

export type ResultadoOtimizacao = {
  readonly formato: FormatId
  readonly bytesOrigem: number
  readonly bytesSaida: number
  readonly variacaoPercent: number
  readonly totalMs: number
  readonly perfisMantidos: readonly string[]
  readonly erro: string | null
}

/**
 * Otimizacao no mesmo formato.
 *
 * O objetivo nao e converter, e reduzir. Um aumento de tamanho aqui e um
 * resultado valido e tem de ser visivel, nao escondido.
 */
export async function correrOtimizacaoNoMesmoFormato(
  cliente: EngineClient,
  amostras: readonly { formato: FormatId; ficheiro: File }[],
  progresso: Progresso,
): Promise<readonly ResultadoOtimizacao[]> {
  const resultados: ResultadoOtimizacao[] = []

  for (const { formato, ficheiro } of amostras) {
    progresso(`A otimizar ${formato} para ${formato}...`)
    try {
      const r = await cliente.convert(ficheiro, opcoesPorDefeito(formato))
      resultados.push({
        formato,
        bytesOrigem: ficheiro.size,
        bytesSaida: r.size,
        variacaoPercent: Number((((r.size - ficheiro.size) / ficheiro.size) * 100).toFixed(1)),
        totalMs: r.durationMs,
        perfisMantidos: r.profilesKept,
        erro: null,
      })
    } catch (erro) {
      resultados.push({
        formato,
        bytesOrigem: ficheiro.size,
        bytesSaida: 0,
        variacaoPercent: 0,
        totalMs: 0,
        perfisMantidos: [],
        erro: mensagem(erro),
      })
    }
  }

  return resultados
}

export function mensagem(erro: unknown): string {
  if (erro instanceof ErroDoMotor) return `${erro.detalhe.kind}: ${erro.detalhe.message}`
  return erro instanceof Error ? erro.message : String(erro)
}

export const LIMITES_ATUAIS = LIMITES
