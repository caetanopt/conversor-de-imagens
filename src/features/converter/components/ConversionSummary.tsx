'use client'

/**
 * Comparacao antes e depois.
 *
 * Se o resultado ficar maior, isso e mostrado com o mesmo destaque de uma
 * reducao. Esconder um aumento seria mentir ao utilizador sobre o unico
 * numero que ele veio ca ver. CLAUDE.md, seccao 24.
 */
import { formatoPorId } from '@/config/formats'
import { formatarBytes, formatarDimensoes, formatarDuracao } from '@/lib/format/bytes'
import { compararTamanhos, formatarVariacao } from '@/lib/format/percent'
import { avaliarFundo } from '../state/fundo'
import type { ImageJob } from '../types'
import { Notice, NoticeDetail, NoticeMessage } from './Notice'
import styles from './ConversionSummary.module.css'

type Props = { readonly job: ImageJob }

export function ConversionSummary({ job }: Props) {
  const resultado = job.result
  if (!resultado || !job.inspection) return null

  const comparacao = compararTamanhos(job.sourceSize, resultado.size)
  const origem = job.sourceFormat ? formatoPorId(job.sourceFormat).label : 'desconhecido'
  const destino = formatoPorId(resultado.formatId).label
  const fundo = avaliarFundo(resultado.backgroundKeptPercent)

  /*
   * Um recorte falhado nao pode ser apresentado como um ganho.
   *
   * O caso medido: um objeto quase da cor do fundo desaparece por completo e o
   * ficheiro cai para 173 bytes, o que o destaque lia como "menos 94 %" em
   * verde, ao lado de um aviso a dizer que a imagem tinha sido apagada. O
   * numero e verdadeiro e fica; o tom de vitoria e que nao pode ficar.
   */
  const recorteFalhado = fundo !== null && fundo.tipo !== 'removido'

  return (
    <section className={styles.envolvente} aria-label="Comparação do resultado">
      <div
        className={[
          styles.destaque,
          recorteFalhado
            ? styles.suspeito
            : comparacao.direction === 'aumentou'
              ? styles.aumentou
              : styles.reduziu,
        ].join(' ')}
      >
        <span className="etiqueta">Tamanho final</span>
        <strong className={`${styles.numeroGrande} numerico`}>
          {formatarBytes(resultado.size)}
        </strong>
        <span className={styles.variacao}>
          {comparacao.direction === 'aumentou' ? 'Ficheiro maior, ' : ''}
          {formatarVariacao(comparacao)}
        </span>
      </div>

      <dl className={styles.tabela}>
        <Linha etiqueta="Formato" antes={origem} depois={destino} />
        <Linha
          etiqueta="Dimensões"
          antes={formatarDimensoes(job.inspection.width, job.inspection.height)}
          depois={formatarDimensoes(resultado.width, resultado.height)}
        />
        <Linha
          etiqueta="Tamanho"
          antes={formatarBytes(job.sourceSize)}
          depois={formatarBytes(resultado.size)}
        />
      </dl>

      {/* O desfecho do recorte fica junto do resultado e nao no painel: e um
          facto medido nos pixeis produzidos, nao uma previsao. Os dois casos
          maus dizem o que fazer, porque sem isso o utilizador so sabe que
          correu mal. */}
      {fundo ? (
        <Notice tipo={fundo.tipo === 'removido' ? 'informacao' : 'perda'}>
          <NoticeMessage>{fundo.mensagem}</NoticeMessage>
          {fundo.sugestao ? <NoticeDetail>{fundo.sugestao}</NoticeDetail> : null}
        </Notice>
      ) : null}

      <p className={styles.tempo}>
        Processado no seu dispositivo em{' '}
        <span className="numerico">{formatarDuracao(resultado.durationMs)}</span>.
      </p>
    </section>
  )
}

function Linha({
  etiqueta,
  antes,
  depois,
}: {
  readonly etiqueta: string
  readonly antes: string
  readonly depois: string
}) {
  return (
    <div className={styles.linha}>
      <dt className="etiqueta">{etiqueta}</dt>
      <dd className={styles.valores}>
        <span className={`${styles.antes} numerico`}>{antes}</span>
        <span className={styles.seta} aria-hidden="true">
          &rarr;
        </span>
        <span className={`${styles.depois} numerico`}>{depois}</span>
      </dd>
    </div>
  )
}
