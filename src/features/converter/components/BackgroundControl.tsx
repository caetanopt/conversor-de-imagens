'use client'

/**
 * Remocao do fundo.
 *
 * Funciona por preenchimento a partir dos quatro cantos com tolerancia de cor,
 * e nao por segmentacao: reconhece uma regiao contigua de cor semelhante ligada
 * a borda, nao um objeto. Isso decide tudo o que este componente diz.
 *
 * O texto nao promete o que o metodo nao faz. Uma fotografia de produto sobre
 * fundo liso funciona; uma pessoa num cenario nao, e medimos: num fundo
 * fotografico o recorte sai aos pedacos. Prometer "remover o fundo" sem esta
 * distincao seria vender uma ferramenta de IA que nao existe aqui.
 *
 * Sem canal alfa no destino o controlo continua visivel, em vez de desaparecer:
 * um controlo que se evapora ao mudar de formato deixa o utilizador sem saber
 * se a opcao existe. Diz que nao ha onde guardar a transparencia e porque.
 */
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import { formatoPorId, type FormatId } from '@/config/formats'
import { FUNDO_POR_DEFEITO } from '@/lib/image-engine/options'
import type { BackgroundTolerance } from '../types'
import { Notice, NoticeDetail, NoticeMessage } from './Notice'
import styles from './BackgroundControl.module.css'

/**
 * Os tres niveis, com os valores medidos por tras.
 *
 * As etiquetas descrevem o FUNDO e nao a tolerancia, porque e o fundo que o
 * utilizador esta a olhar. "8 %" nao ajuda ninguem a escolher.
 */
const OPCOES: readonly { readonly value: BackgroundTolerance; readonly label: string }[] = [
  { value: 'exata', label: 'Cor exata' },
  { value: 'normal', label: 'Ligeira variação' },
  { value: 'ampla', label: 'Muita variação' },
] as const

const AJUDA: Record<BackgroundTolerance, string> = {
  exata:
    'Remove apenas o que tem praticamente a mesma cor dos cantos. É a opção segura: não apaga um objeto de cor parecida com o fundo.',
  normal:
    'Aceita ligeiras diferenças, o que resolve fundos de estúdio com ruído ou gradiente. Um objeto quase da cor do fundo pode desaparecer.',
  ampla:
    'Aceita diferenças grandes. Só compensa quando as outras deixam fundo por remover, e apaga objetos claros com facilidade.',
}

type Props = {
  readonly outputFormat: FormatId
  readonly background: BackgroundTolerance | null
  readonly onChange: (background: BackgroundTolerance | null) => void
  readonly disabled?: boolean
}

export function BackgroundControl({ outputFormat, background, onChange, disabled = false }: Props) {
  const formato = formatoPorId(outputFormat)

  if (!formato.supportsAlpha) {
    return (
      <div className={styles.envolvente}>
        <Notice tipo="informacao">
          <NoticeMessage>Remover o fundo não é possível em {formato.label}.</NoticeMessage>
          <NoticeDetail>
            O formato não tem canal de transparência, por isso não há onde guardar o fundo
            removido. Escolha PNG, WebP ou AVIF para usar esta opção.
          </NoticeDetail>
        </Notice>
      </div>
    )
  }

  const ligada = background !== null

  return (
    <div className={styles.envolvente}>
      <label className={styles.ligar}>
        <input
          type="checkbox"
          checked={ligada}
          disabled={disabled}
          onChange={(evento) => onChange(evento.target.checked ? FUNDO_POR_DEFEITO : null)}
        />
        <span>Remover fundo</span>
      </label>

      <p className={styles.nota}>
        Torna transparente a área de cor uniforme em volta da imagem. Funciona em fotografias de
        produto, logótipos e capturas de ecrã. Num fundo com paisagem ou textura o recorte fica
        incompleto.
      </p>

      {ligada ? (
        <>
          <SegmentedControl
            legenda="Variação de cor do fundo"
            opcoes={OPCOES}
            valor={background}
            onChange={onChange}
            disabled={disabled}
          />
          <p className={styles.ajuda}>{AJUDA[background]}</p>
          <p className={styles.aviso}>
            Depois de converter, o resumo diz quanto da imagem sobrou. Confirme esse valor antes de
            descarregar: um recorte que apagou a imagem toda ou que não removeu nada aparece ali.
          </p>
        </>
      ) : null}
    </div>
  )
}
