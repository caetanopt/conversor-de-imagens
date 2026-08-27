'use client'

/**
 * Reducao da paleta de cores.
 *
 * So aparece onde tem efeito medido, hoje apenas em PNG. Existe porque num
 * formato sem perda nao ha qualidade para baixar: recomprimir um PNG sem perda
 * da 0,0 %, e reduzir a paleta da 68 % na mesma imagem. Sem este controlo,
 * "otimizar um PNG" nao tinha nenhuma alavanca a serio.
 * Ver docs/medicoes.md e CLAUDE.md, seccao 11.
 *
 * Perde informacao, e por isso e uma escolha explicita e nunca um defeito. O
 * texto diz o que acontece em vez de prometer magia.
 */
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import { formatoPorId, type FormatId } from '@/config/formats'
import styles from './PaletteControl.module.css'

/**
 * As tres opcoes de paleta.
 *
 * 256 e o maximo de um PNG indexado e o ponto onde a perda e menos visivel.
 * Os outros dois existem porque em imagens com poucas cores, como logotipos e
 * grafismos, descem bastante mais sem diferenca perceptivel.
 */
const OPCOES = [
  { value: '256', label: '256 cores' },
  { value: '128', label: '128 cores' },
  { value: '64', label: '64 cores' },
] as const

type Props = {
  readonly outputFormat: FormatId
  readonly palette: number | null
  readonly onChange: (palette: number | null) => void
  readonly disabled?: boolean
}

export function PaletteControl({ outputFormat, palette, onChange, disabled = false }: Props) {
  const formato = formatoPorId(outputFormat)
  if (!formato.supportsPalette) return null

  const ligada = palette !== null

  return (
    <div className={styles.envolvente}>
      <label className={styles.ligar}>
        <input
          type="checkbox"
          checked={ligada}
          disabled={disabled}
          onChange={(evento) => onChange(evento.target.checked ? 256 : null)}
        />
        <span>Reduzir paleta de cores</span>
      </label>

      <p className={styles.nota}>
        {ligada
          ? `A imagem passa a usar no máximo ${palette} cores. É a única forma de reduzir bastante um ${formato.label}, e costuma cortar mais de metade do tamanho.`
          : `Reduz muito o tamanho de um ${formato.label}, à custa de usar menos cores. Sem isto, otimizar um ${formato.label} só remove metadados.`}
      </p>

      {ligada ? (
        <>
          <SegmentedControl
            legenda="Cores da paleta"
            opcoes={OPCOES.map((o) => ({ value: o.value, label: o.label }))}
            valor={String(palette)}
            onChange={(valor) => onChange(Number(valor))}
            disabled={disabled}
          />
          <p className={styles.aviso}>
            Menos cores dão ficheiros mais pequenos, e a perda é mais visível em fotografias e
            gradientes do que em grafismos. Compare o resultado antes de descarregar.
          </p>
        </>
      ) : null}
    </div>
  )
}
