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
import { formatoDeOtimizacao } from '../state/jobsReducer'
import { useConverter } from '../hooks/useConverter'
import { BatchActionBar } from './BatchActionBar'
import { ConversionModeControl } from './ConversionModeControl'
import { ConversionSummary } from './ConversionSummary'
import { DropZone } from './DropZone'
import { FileQueueItem } from './FileQueueItem'
import { FormatSelect } from './FormatSelect'
import { ImagePreview } from './ImagePreview'
import { MetadataControl } from './MetadataControl'
import { QualityControl } from './QualityControl'
import { ResizeControls } from './ResizeControls'
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
  const destinoDeOtimizacao = formatoDeOtimizacao(job.sourceFormat)

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
            <ConversionModeControl
              modo={conversor.mode}
              sourceFormat={job.sourceFormat}
              formatoDeOtimizacao={destinoDeOtimizacao}
              onChange={conversor.definirModo}
              disabled={aProcessar}
            />

            <hr className={styles.divisor} />

            {conversor.mode === 'converter' ? (
              <>
                <FormatSelect
                  valor={job.options.outputFormat}
                  onChange={(formato) => conversor.definirFormatoDeSaida(job.id, formato)}
                  disabled={aProcessar}
                />
                <hr className={styles.divisor} />
              </>
            ) : null}

            <QualityControl
              outputFormat={job.options.outputFormat}
              quality={job.options.quality}
              preset={job.options.preset}
              onQualidade={(valor) => conversor.definirQualidade(job.id, valor)}
              onPreset={(preset) => conversor.definirPreset(job.id, preset)}
              disabled={aProcessar}
            />

            <hr className={styles.divisor} />

            <ResizeControls
              valor={job.options.resize}
              origem={job.inspection}
              onChange={(resize) => conversor.definirResize(job.id, resize)}
              disabled={aProcessar}
            />

            <hr className={styles.divisor} />

            <MetadataControl
              valor={job.options.metadata}
              onChange={(politica) => conversor.definirMetadados(job.id, politica)}
              disabled={aProcessar}
            />

            <hr className={styles.divisor} />

            <p className={styles.nota}>
              A orientação é sempre corrigida a partir do EXIF antes de os metadados serem
              removidos, para a imagem não sair deitada.
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
