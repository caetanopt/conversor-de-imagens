'use client'

/**
 * Mesa de trabalho.
 *
 * Composicao dos estados da area: vazia, a preparar o motor, e com imagens
 * carregadas. Sem hero, sem cartoes de beneficios, sem secoes de marketing
 * antes da ferramenta. CLAUDE.md, seccoes 13 e 26.
 *
 * A ordem no telemovel nao e a ordem do desktop comprimida: fila,
 * pre-visualizacao, resultado, definicoes. No desktop as mesmas quatro zonas
 * organizam-se em rail, palco e painel.
 *
 * O painel edita sempre um ficheiro, o selecionado. Com varios, "Aplicar a
 * todos" empurra essas definicoes para os restantes, o que evita repetir a
 * mesma escolha trinta vezes. CLAUDE.md, seccao 13.
 */
import { useState } from 'react'

import { Button } from '@/components/controls/Button'
import { LiveRegion } from '@/components/feedback/LiveRegion'
import { ProgressIndicator } from '@/components/feedback/ProgressIndicator'
import { formatoDeOtimizacao } from '../state/jobsReducer'
import { useConverter } from '../hooks/useConverter'
import { BatchActionBar } from './BatchActionBar'
import { ConversionModeControl } from './ConversionModeControl'
import { ConversionSummary } from './ConversionSummary'
import { DropZone } from './DropZone'
import { FileQueue } from './FileQueue'
import { FormatSelect } from './FormatSelect'
import { FramesNotice } from './FramesNotice'
import { ImagePreview } from './ImagePreview'
import { MetadataControl } from './MetadataControl'
import { QualityControl } from './QualityControl'
import { ResizeControls } from './ResizeControls'
import styles from './ConverterWorkbench.module.css'

export function ConverterWorkbench() {
  const conversor = useConverter()
  const [painelAberto, setPainelAberto] = useState(true)
  const job = conversor.selecionado
  const { resumo } = conversor

  if (!job) {
    return (
      <div className={styles.vazio}>
        <LiveRegion mensagem={conversor.anuncio} />
        <DropZone onFicheiros={conversor.adicionarFicheiros} />
      </div>
    )
  }

  const lote = resumo.total > 1
  // Enquanto o lote corre, as definicoes de um ficheiro que ja esta na fila do
  // motor deixariam de corresponder ao que vai ser produzido.
  const definicoesBloqueadas = resumo.aProcessar > 0 || conversor.aAnalisar
  const destinoDeOtimizacao = formatoDeOtimizacao(job.sourceFormat)

  return (
    <div className={styles.area}>
      <LiveRegion mensagem={conversor.anuncio} />

      <div className={styles.corpo}>
        <aside className={styles.rail} aria-label="Ficheiros na fila">
          <FileQueue
            jobs={conversor.jobs}
            selecionadoId={job.id}
            onSelecionar={conversor.selecionar}
            onRemover={conversor.remover}
            onRemoverTodos={conversor.removerTodos}
            onCancelar={conversor.cancelar}
            onDescarregar={conversor.descarregar}
            onAdicionar={conversor.adicionarFicheiros}
            disabled={conversor.aAnalisar}
          />

          {conversor.estadoDoMotor === 'a-preparar' ? (
            <ProgressIndicator
              etiqueta="A preparar o motor de conversão"
              detalhe="Descarregado uma vez e guardado em cache pelo browser."
            />
          ) : null}

          {conversor.aAnalisar ? (
            <ProgressIndicator
              etiqueta="A analisar os ficheiros"
              detalhe="A ler dimensões e a criar pré-visualizações."
            />
          ) : null}

          {/* O erro de cada ficheiro e mostrado dentro da sua linha na fila,
              junto do ficheiro a que pertence. Aqui ficam apenas os avisos do
              ficheiro selecionado, que sao sobre o que o painel esta a editar. */}
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
          {resumo.aProcessar > 0 ? (
            <ProgressIndicator
              etiqueta={
                resumo.aProcessar === 1
                  ? 'A converter no seu dispositivo'
                  : `A converter ${resumo.aProcessar} imagens no seu dispositivo`
              }
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
            {lote ? (
              <p className={styles.alvo}>
                A editar <strong>{job.sourceName}</strong>
              </p>
            ) : null}

            <ConversionModeControl
              modo={conversor.mode}
              sourceFormat={job.sourceFormat}
              formatoDeOtimizacao={destinoDeOtimizacao}
              onChange={conversor.definirModo}
              disabled={definicoesBloqueadas}
            />

            <hr className={styles.divisor} />

            {conversor.mode === 'converter' ? (
              <>
                <FormatSelect
                  valor={job.options.outputFormat}
                  onChange={(formato) => conversor.definirFormatoDeSaida(job.id, formato)}
                  disabled={definicoesBloqueadas}
                />
                <hr className={styles.divisor} />
              </>
            ) : null}

            {/* Antes da conversao, nao depois. CLAUDE.md, seccao 5.8. */}
            <FramesNotice
              inspection={job.inspection}
              outputFormat={job.options.outputFormat}
            />

            <QualityControl
              outputFormat={job.options.outputFormat}
              quality={job.options.quality}
              preset={job.options.preset}
              onQualidade={(valor) => conversor.definirQualidade(job.id, valor)}
              onPreset={(preset) => conversor.definirPreset(job.id, preset)}
              disabled={definicoesBloqueadas}
            />

            <hr className={styles.divisor} />

            <ResizeControls
              valor={job.options.resize}
              origem={job.inspection}
              onChange={(resize) => conversor.definirResize(job.id, resize)}
              disabled={definicoesBloqueadas}
            />

            <hr className={styles.divisor} />

            <MetadataControl
              valor={job.options.metadata}
              onChange={(politica) => conversor.definirMetadados(job.id, politica)}
              disabled={definicoesBloqueadas}
            />

            <hr className={styles.divisor} />

            {lote ? (
              <div className={styles.aplicar}>
                <Button
                  variante="secundario"
                  onClick={() => conversor.aplicarATodos(job.id)}
                  disabled={definicoesBloqueadas}
                >
                  Aplicar a todos os ficheiros
                </Button>
                <p className={styles.nota}>
                  {conversor.mode === 'otimizar'
                    ? 'No modo otimizar cada ficheiro mantém o seu formato de origem. Copiamos qualidade, dimensões e metadados.'
                    : 'Substitui as definições dos outros ficheiros e descarta resultados já produzidos com definições diferentes.'}
                </p>
              </div>
            ) : null}

            <p className={styles.nota}>
              A orientação é sempre corrigida a partir do EXIF antes de os metadados serem
              removidos, para a imagem não sair deitada.
            </p>
          </section>
        </div>
      </div>

      <footer className={styles.rodape}>
        <BatchActionBar
          resumo={resumo}
          selecionado={job}
          motorPronto={conversor.estadoDoMotor === 'pronto'}
          aAnalisar={conversor.aAnalisar}
          aEmpacotar={conversor.aEmpacotar}
          onConverter={(id) => void conversor.converter(id)}
          onConverterTodos={() => void conversor.converterTodos()}
          onDescarregar={conversor.descarregar}
          onDescarregarTodos={() => void conversor.descarregarTodos()}
          onCancelar={() => conversor.cancelar()}
        />
      </footer>
    </div>
  )
}
