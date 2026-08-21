'use client'

/**
 * Mesa de trabalho.
 *
 * Composicao dos estados da area: vazia, a preparar o motor, e com uma imagem
 * carregada. Sem hero, sem cartoes de beneficios, sem secoes de marketing
 * antes da ferramenta. CLAUDE.md, seccoes 13 e 26.
 *
 * A ordem no telemovel nao e a ordem do desktop comprimida: ficheiro,
 * pre-visualizacao, resultado, definicoes. No desktop as mesmas quatro zonas
 * organizam-se em rail, palco e painel.
 */
import { useState } from 'react'

import { ErrorMessage } from '@/components/feedback/ErrorMessage'
import { LiveRegion } from '@/components/feedback/LiveRegion'
import { ProgressIndicator } from '@/components/feedback/ProgressIndicator'
import { useConverter } from '../hooks/useConverter'
import { BatchActionBar } from './BatchActionBar'
import { ConversionSummary } from './ConversionSummary'
import { DropZone } from './DropZone'
import { FileQueueItem } from './FileQueueItem'
import { FormatSelect } from './FormatSelect'
import { ImagePreview } from './ImagePreview'
import { QualityControl } from './QualityControl'
import styles from './ConverterWorkbench.module.css'

export function ConverterWorkbench() {
  const conversor = useConverter()
  const [painelAberto, setPainelAberto] = useState(true)
  const job = conversor.jobAtivo

  if (!job) {
    return (
      <div className={styles.vazio}>
        <LiveRegion mensagem={conversor.anuncio} />
        <DropZone onFicheiro={conversor.adicionarFicheiro} />
      </div>
    )
  }

  const aProcessar = job.status === 'processing'

  return (
    <div className={styles.area}>
      <LiveRegion mensagem={conversor.anuncio} />

      <div className={styles.corpo}>
        <aside className={styles.rail} aria-label="Ficheiro">
          <FileQueueItem job={job} onRemover={conversor.remover} />

          {conversor.estadoDoMotor === 'a-preparar' ? (
            <ProgressIndicator
              etiqueta="A preparar o motor de conversão"
              detalhe="Descarregado uma vez e guardado em cache pelo browser."
            />
          ) : null}

          {job.error ? <ErrorMessage erro={job.error} /> : null}

          {job.warnings.length > 0 ? (
            <ul className={styles.avisos}>
              {job.warnings.map((aviso) => (
                <li key={aviso}>{aviso}</li>
              ))}
            </ul>
          ) : null}
        </aside>

        <main className={styles.palco}>
          <ImagePreview job={job} />
          {aProcessar ? (
            <ProgressIndicator
              etiqueta="A converter no seu dispositivo"
              detalhe="A interface continua utilizável."
            />
          ) : null}
        </main>

        {job.result ? (
          <section className={styles.resultado}>
            <ConversionSummary job={job} />
          </section>
        ) : null}

        <div className={styles.colunaPainel}>
          <button
            type="button"
            className={styles.alternar}
            aria-expanded={painelAberto}
            aria-controls="painel-definicoes"
            onClick={() => setPainelAberto((v) => !v)}
          >
            Definições
            <span aria-hidden="true">{painelAberto ? '−' : '+'}</span>
          </button>

          <section
            id="painel-definicoes"
            className={[styles.painel, painelAberto ? '' : styles.painelFechado]
              .filter(Boolean)
              .join(' ')}
            aria-label="Definições de conversão"
          >
            <FormatSelect
              valor={job.options.outputFormat}
              onChange={(formato) => conversor.definirFormatoDeSaida(job.id, formato)}
              disabled={aProcessar}
            />

            <hr className={styles.divisor} />

            <QualityControl
              outputFormat={job.options.outputFormat}
              quality={job.options.quality}
              preset={job.options.preset}
              onQualidade={(valor) => conversor.definirQualidade(job.id, valor)}
              onPreset={(preset) => conversor.definirPreset(job.id, preset)}
              disabled={aProcessar}
            />

            <hr className={styles.divisor} />

            <p className={styles.nota}>
              Os metadados são removidos e a orientação é corrigida antes da conversão. O controlo
              destas opções chega numa próxima etapa.
            </p>
          </section>
        </div>
      </div>

      <footer className={styles.rodape}>
        <BatchActionBar
          job={job}
          motorPronto={conversor.estadoDoMotor === 'pronto'}
          onConverter={() => void conversor.converter(job.id)}
          onDescarregar={() => conversor.descarregar(job)}
          onCancelar={conversor.cancelar}
        />
      </footer>
    </div>
  )
}
