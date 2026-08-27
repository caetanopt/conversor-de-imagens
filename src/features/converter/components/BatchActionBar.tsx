'use client'

/**
 * Barra de acoes persistente.
 *
 * Os tamanhos ficam junto da acao de descarregar, porque e ali que o
 * utilizador decide se o resultado lhe serve. CLAUDE.md, seccao 13.
 *
 * Com um ficheiro mostra os numeros desse ficheiro. Com vários mostra o total
 * dos que ja concluiram e quantos concluiram, incluindo o caso parcial: se
 * tres de dez falharam, o texto diz isso em vez de "concluido".
 * CLAUDE.md, seccao 17.7.
 */
import { Button } from '@/components/controls/Button'
import { formatoPorId } from '@/config/formats'
import { formatarBytes } from '@/lib/format/bytes'
import { compararTamanhos, formatarVariacao } from '@/lib/format/percent'
import type { ResumoDoLote } from '../state/selectors'
import type { ConversionMode, ImageJob } from '../types'
import styles from './BatchActionBar.module.css'

type Props = {
  readonly resumo: ResumoDoLote
  /** Ficheiro em foco. Com um unico ficheiro na fila e sempre esse. */
  readonly selecionado: ImageJob | null
  readonly mode: ConversionMode
  readonly motorPronto: boolean
  readonly aAnalisar: boolean
  readonly aEmpacotar: boolean
  readonly onConverter: (id: string) => void
  readonly onConverterTodos: () => void
  readonly onDescarregar: (job: ImageJob) => void
  readonly onDescarregarTodos: () => void
  readonly onCancelar: () => void
}

export function BatchActionBar({
  resumo,
  selecionado,
  mode,
  motorPronto,
  aAnalisar,
  aEmpacotar,
  onConverter,
  onConverterTodos,
  onDescarregar,
  onDescarregarTodos,
  onCancelar,
}: Props) {
  const lote = resumo.total > 1
  const aProcessar = resumo.aProcessar > 0
  const comResultado = resumo.concluidosComResultado.length
  const podeConverter = resumo.porConverter > 0 && motorPronto && !aProcessar && !aAnalisar

  /**
   * A acao de converter desaparece so quando nao sobra nada por converter.
   * Um ficheiro recusado pela validacao deixa o botao visivel mas desligado:
   * remover a acao do ecra faria a barra parecer vazia e avariada, quando o
   * que se passa e que aquele ficheiro nao pode ser convertido.
   */
  const mostrarConverter = resumo.concluidos < resumo.total

  return (
    <div className={styles.barra}>
      {lote ? (
        <LoteNumeros resumo={resumo} />
      ) : selecionado ? (
        <FicheiroNumeros job={selecionado} />
      ) : null}

      <div className={styles.acoes}>
        {aProcessar ? (
          <Button variante="secundario" onClick={onCancelar}>
            {lote ? 'Cancelar tudo' : 'Cancelar'}
          </Button>
        ) : null}

        {comResultado > 0 ? (
          <Button
            variante={mostrarConverter ? 'secundario' : 'primario'}
            onClick={() => {
              if (lote) onDescarregarTodos()
              else if (selecionado) onDescarregar(selecionado)
            }}
            disabled={aEmpacotar}
            aria-busy={aEmpacotar}
          >
            {textoDeDescarregar(lote, comResultado, aEmpacotar, selecionado)}
          </Button>
        ) : null}

        {mostrarConverter ? (
          <Button
            variante="primario"
            onClick={() => {
              if (lote) onConverterTodos()
              else if (selecionado) onConverter(selecionado.id)
            }}
            disabled={!podeConverter}
            aria-busy={aProcessar}
          >
            {textoDaAcaoPrincipal(resumo, aProcessar, aAnalisar, selecionado, mode)}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function FicheiroNumeros({ job }: { readonly job: ImageJob }) {
  return (
    <div className={styles.numeros}>
      <span className={styles.par}>
        <span className="etiqueta">Original</span>
        <span className="numerico">{formatarBytes(job.sourceSize)}</span>
      </span>
      <span className={styles.par}>
        <span className="etiqueta">Final</span>
        <span className={`${styles.final} numerico`}>
          {job.result ? formatarBytes(job.result.size) : '--'}
        </span>
      </span>
    </div>
  )
}

function LoteNumeros({ resumo }: { readonly resumo: ResumoDoLote }) {
  const comparacao =
    resumo.bytesOriginais > 0 ? compararTamanhos(resumo.bytesOriginais, resumo.bytesFinais) : null

  return (
    <div className={styles.numeros}>
      <span className={styles.par}>
        <span className="etiqueta">Estado</span>
        <span className={styles.estado}>{textoDeEstado(resumo)}</span>
      </span>

      {comparacao ? (
        <>
          <span className={styles.par}>
            <span className="etiqueta">Original</span>
            <span className="numerico">{formatarBytes(resumo.bytesOriginais)}</span>
          </span>
          <span className={styles.par}>
            <span className="etiqueta">Final</span>
            <span className={`${styles.final} numerico`}>
              {formatarBytes(resumo.bytesFinais)}
            </span>
          </span>
          <span className={styles.par}>
            <span className="etiqueta">Variação</span>
            <span
              className={comparacao.direction === 'aumentou' ? styles.aumentou : styles.reduziu}
            >
              {formatarVariacao(comparacao)}
            </span>
          </span>
        </>
      ) : null}
    </div>
  )
}

/** Nunca diz "concluido" quando parte do lote falhou. */
function textoDeEstado(resumo: ResumoDoLote): string {
  switch (resumo.estado) {
    case 'a-processar':
      return `A converter ${resumo.aProcessar} de ${resumo.total}`
    case 'concluido':
      return `${resumo.concluidos} de ${resumo.total} concluídas`
    case 'parcial':
      return `${resumo.concluidos} de ${resumo.total} concluídas, ${textoDeFalhas(resumo)}`
    case 'falhou':
      return `Nenhuma concluída, ${textoDeFalhas(resumo)}`
    default:
      return `${resumo.total} ficheiros na fila`
  }
}

function textoDeFalhas(resumo: ResumoDoLote): string {
  const partes: string[] = []
  if (resumo.comErro > 0) partes.push(`${resumo.comErro} com erro`)
  if (resumo.cancelados > 0) partes.push(`${resumo.cancelados} ${resumo.cancelados === 1 ? 'cancelada' : 'canceladas'}`)
  return partes.join(' e ')
}

/**
 * O verbo segue o modo em vigor, nao o modo em que o ficheiro entrou na fila.
 * Sem isto o botao ficava preso no texto de "Converter" mesmo depois de o
 * utilizador escolher "Otimizar", porque nada voltava a ler o modo atual.
 */
function textoDaAcaoPrincipal(
  resumo: ResumoDoLote,
  aProcessar: boolean,
  aAnalisar: boolean,
  selecionado: ImageJob | null,
  mode: ConversionMode,
): string {
  const acao = mode === 'otimizar' ? 'Otimizar' : 'Converter'
  if (aAnalisar) return 'A analisar ficheiros...'
  if (aProcessar) return mode === 'otimizar' ? 'A otimizar...' : 'A converter...'
  if (resumo.total > 1) {
    // Com o lote todo recusado, "Otimizar 0 imagens" seria absurdo.
    if (resumo.porConverter === 0) return `Nada para ${acao.toLowerCase()}`
    return `${acao} ${resumo.porConverter} ${resumo.porConverter === 1 ? 'imagem' : 'imagens'}`
  }
  if (!selecionado) return acao
  return `${acao} para ${formatoPorId(selecionado.options.outputFormat).label}`
}

function textoDeDescarregar(
  lote: boolean,
  comResultado: number,
  aEmpacotar: boolean,
  selecionado: ImageJob | null,
): string {
  if (aEmpacotar) return 'A criar o ZIP...'
  if (lote) return `Descarregar ${comResultado} em ZIP`
  if (selecionado?.result) return `Descarregar ${formatoPorId(selecionado.result.formatId).label}`
  return 'Descarregar'
}
