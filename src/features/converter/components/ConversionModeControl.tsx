'use client'

/**
 * Escolha entre otimizar, converter e redimensionar.
 *
 * Nao sao tres produtos nem tres caminhos de codigo: e o mesmo pipeline com uma
 * restricao diferente no formato de destino. Em 'otimizar' e em 'redimensionar'
 * o destino e o formato de origem; em 'converter' o utilizador escolhe.
 * CLAUDE.md, seccao 12.
 *
 * O terceiro segmento cabe na mesma faixa porque o SegmentedControl muda de
 * linha quando nao ha largura (`flex-wrap` com `flex-basis`), o que ja foi
 * preciso para os seis formatos de destino num painel de 320 px.
 */
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import { formatoPorId, type FormatId } from '@/config/formats'
import type { ConversionMode } from '../types'
import styles from './ConversionModeControl.module.css'

type Props = {
  readonly modo: ConversionMode
  readonly sourceFormat: FormatId | null
  /** Null quando otimizar no mesmo formato nao e possivel para esta origem. */
  readonly formatoDeOtimizacao: FormatId | null
  readonly onChange: (modo: ConversionMode) => void
  readonly disabled?: boolean
}

/**
 * Onde otimizar no mesmo formato nao recomprime nada.
 *
 * A regra sai do registry em vez de uma lista a manter a mao: so ha margem para
 * reduzir onde existe qualidade com perda para baixar. Nos formatos sem perda
 * este motor nao e um otimizador, ele apenas volta a escrever com as mesmas
 * definicoes.
 *
 * Medido sobre as fixtures, saida byte a byte igual a entrada em todos:
 *
 *   PNG    520 829 -> 520 829     BMP    360 138 -> 360 138
 *   TIFF 2 880 288 -> 2 880 288   ICO     16 958 -> 16 958
 *   GIF    153 630 -> 153 630 (animado, 6 fotogramas)
 *
 * O encoder de PNG confirmou-o de outra forma: os niveis de compressao 6 e 9
 * dao bytes identicos e o nivel 0 apenas aumenta 71 %.
 */
function recomprimeNoMesmoFormato(formato: FormatId): boolean {
  return formatoPorId(formato).supportsQuality
}

export function ConversionModeControl({
  modo,
  sourceFormat,
  formatoDeOtimizacao,
  onChange,
  disabled = false,
}: Props) {
  const podeOtimizar = formatoDeOtimizacao !== null
  const etiquetaOrigem = sourceFormat ? formatoPorId(sourceFormat).label : null
  const semRecompressao =
    modo !== 'converter' &&
    formatoDeOtimizacao !== null &&
    !recomprimeNoMesmoFormato(formatoDeOtimizacao)
  // Onde a paleta e uma alavanca real, o aviso aponta para ela em vez de dizer
  // que so ha metadados a ganhar, que era falso num PNG.
  const podeReduzirPaleta =
    formatoDeOtimizacao !== null && formatoPorId(formatoDeOtimizacao).supportsPalette

  return (
    <div className={styles.envolvente}>
      <SegmentedControl
        legenda="O que fazer"
        opcoes={[
          { value: 'otimizar', label: 'Otimizar' },
          { value: 'converter', label: 'Converter' },
          { value: 'redimensionar', label: 'Redimensionar' },
        ]}
        valor={modo}
        onChange={onChange}
        disabled={disabled || !podeOtimizar}
      />

      <p className={styles.explicacao}>
        {!podeOtimizar
          ? `Não é possível manter ${etiquetaOrigem ?? 'este formato'}. Escolha um formato de destino.`
          : modo === 'converter'
            ? 'Permite escolher outro formato de destino.'
            : modo === 'redimensionar'
              ? // Diz as duas vias, porque a etiqueta so nomeia uma.
                `Mantém ${etiquetaOrigem} e altera as dimensões, por escala ou por corte.`
              : semRecompressao
                ? // Prometer reducao de tamanho num formato sem perda seria falso.
                  `Mantém ${etiquetaOrigem} e aplica as definições escolhidas.`
                : `Mantém ${etiquetaOrigem} e reduz o tamanho do ficheiro.`}
      </p>

      {semRecompressao && modo !== 'redimensionar' ? (
        <p className={styles.aviso}>
          {etiquetaOrigem} não tem compressão com perda, por isso otimizar sem mudar de formato
          não recomprime a imagem.{' '}
          {podeReduzirPaleta
            ? `Para reduzir de facto o tamanho, ligue "Reduzir paleta de cores" abaixo: corta mais de metade num ${etiquetaOrigem} típico, à custa de usar menos cores. Converter para WebP desce ainda mais.`
            : 'O único ganho possível vem da remoção de metadados. Para ficheiros bastante mais pequenos, converta para WebP.'}
        </p>
      ) : null}
    </div>
  )
}
