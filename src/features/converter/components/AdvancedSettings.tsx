'use client'

/**
 * Definicoes avancadas.
 *
 * Fechada por defeito, e escondida por completo quando o formato de destino
 * nao tem nada avancado a oferecer. Uma secao vazia e pior do que secao
 * nenhuma.
 *
 * Hoje contem apenas a subamostragem de croma, que o CLAUDE.md, seccao 11,
 * manda tratar assim: "subsampling apenas numa secção avançada, se for
 * relevante e compreensível". Se um dia houver mais controlos deste tipo,
 * entram aqui e nao no painel principal.
 */
import { formatoPorId, type FormatId } from '@/config/formats'
import type { ChromaSubsampling } from '../types'
import styles from './AdvancedSettings.module.css'

type Props = {
  readonly outputFormat: FormatId
  readonly chroma: ChromaSubsampling
  readonly onChroma: (chroma: ChromaSubsampling) => void
  readonly disabled?: boolean
}

export function AdvancedSettings({ outputFormat, chroma, onChroma, disabled = false }: Props) {
  const formato = formatoPorId(outputFormat)
  if (!formato.supportsChromaSubsampling) return null

  const resolucaoTotal = chroma === '4:4:4'

  return (
    <details className={styles.envolvente}>
      <summary className={styles.titulo}>Definições avançadas</summary>

      <div className={styles.corpo}>
        <label className={styles.ligar}>
          <input
            type="checkbox"
            checked={resolucaoTotal}
            disabled={disabled}
            onChange={(evento) => onChroma(evento.target.checked ? '4:4:4' : '4:2:0')}
          />
          <span>Manter a cor em resolução total</span>
        </label>

        <p className={styles.nota}>
          {resolucaoTotal
            ? `A cor fica na resolução da imagem (4:4:4). Num ${formato.label} isto costuma custar mais metade do tamanho do ficheiro.`
            : `A cor é guardada a metade da resolução (4:2:0), que é o que a web usa. O olho distingue muito menos detalhe em cor do que em brilho, e numa fotografia a diferença não se vê.`}
        </p>

        {resolucaoTotal ? null : (
          <p className={styles.nota}>
            Ligue esta opção se a imagem tiver texto colorido fino ou linhas muito saturadas, onde
            podem aparecer franjas de cor.
          </p>
        )}
      </div>
    </details>
  )
}
