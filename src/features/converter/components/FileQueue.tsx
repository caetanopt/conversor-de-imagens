'use client'

/**
 * Fila de ficheiros.
 *
 * Tres responsabilidades: listar, deixar adicionar mais e deixar limpar tudo.
 * Nao decide nada sobre conversao.
 *
 * Sem virtualizacao. O CLAUDE.md, seccao 19.6, pede lista virtualizada quando
 * houver muitos ficheiros, mas o limite medido e de 30 ficheiros
 * (config/limits.ts) e 30 linhas de duas linhas cada nao justificam a
 * complexidade. Se o limite subir, e aqui que se muda.
 */
import { useCallback, useRef, useState } from 'react'

import { Button } from '@/components/controls/Button'
import { FileInput } from '@/components/controls/FileInput'
import { LIMITES } from '@/config/limits'
import type { ImageJob } from '../types'
import { FileQueueItem } from './FileQueueItem'
import styles from './FileQueue.module.css'

type Props = {
  readonly jobs: readonly ImageJob[]
  readonly selecionadoId: string | null
  readonly onSelecionar: (id: string) => void
  readonly onRemover: (id: string) => void
  readonly onRemoverTodos: () => void
  readonly onCancelar: (id: string) => void
  readonly onDescarregar: (job: ImageJob) => void
  readonly onAdicionar: (ficheiros: File[]) => void
  readonly disabled?: boolean
}

export function FileQueue({
  jobs,
  selecionadoId,
  onSelecionar,
  onRemover,
  onRemoverTodos,
  onCancelar,
  onDescarregar,
  onAdicionar,
  disabled = false,
}: Props) {
  const [sobreposto, setSobreposto] = useState(false)
  const contadorArrasto = useRef(0)

  const lote = jobs.length > 1
  const cheia = jobs.length >= LIMITES.maxFicheiros

  // dragenter e dragleave disparam tambem nos filhos. Sem contador, a moldura
  // pisca ao passar por cima de cada linha da lista.
  const aoEntrar = useCallback(() => {
    contadorArrasto.current += 1
    setSobreposto(true)
  }, [])

  const aoSair = useCallback(() => {
    contadorArrasto.current -= 1
    if (contadorArrasto.current <= 0) {
      contadorArrasto.current = 0
      setSobreposto(false)
    }
  }, [])

  return (
    <section
      className={`${styles.fila} ${sobreposto ? styles.receber : ''}`}
      aria-label="Ficheiros"
      onDragEnter={aoEntrar}
      onDragLeave={aoSair}
      onDragOver={(evento) => {
        evento.preventDefault()
        if (evento.dataTransfer) evento.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={(evento) => {
        evento.preventDefault()
        contadorArrasto.current = 0
        setSobreposto(false)
        if (disabled) return
        const ficheiros = Array.from(evento.dataTransfer?.files ?? [])
        if (ficheiros.length > 0) onAdicionar(ficheiros)
      }}
    >
      <header className={styles.cabecalho}>
        <h2 className={styles.contagem}>
          {jobs.length === 1 ? '1 ficheiro' : `${jobs.length} ficheiros`}
        </h2>
        {lote ? (
          <Button variante="discreto" className={styles.limpar} onClick={onRemoverTodos}>
            Remover tudo
          </Button>
        ) : null}
      </header>

      <ul className={styles.lista}>
        {jobs.map((job) => (
          <li key={job.id}>
            <FileQueueItem
              job={job}
              selecionado={job.id === selecionadoId}
              lote={lote}
              onSelecionar={onSelecionar}
              onRemover={onRemover}
              onCancelar={onCancelar}
              onDescarregar={onDescarregar}
            />
          </li>
        ))}
      </ul>

      {cheia ? (
        <p className={styles.limite}>
          Limite de {LIMITES.maxFicheiros} ficheiros atingido. Remova alguns para adicionar outros.
        </p>
      ) : (
        <FileInput onFicheiros={onAdicionar} className={styles.adicionar} disabled={disabled}>
          Adicionar imagens
        </FileInput>
      )}
    </section>
  )
}
