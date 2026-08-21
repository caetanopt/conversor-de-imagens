'use client'

/**
 * Area de entrada de ficheiros.
 *
 * Arrastar e largar e um atalho, nao o unico caminho: a seleccao e um controlo
 * real, alcancavel por teclado, e o input de ficheiro esta associado a uma
 * etiqueta em vez de ser acionado por codigo. CLAUDE.md, seccao 20.5.
 *
 * A superficie ocupa o espaco disponivel porque e o alvo de largar, e o
 * conteudo assenta numa faixa inferior a largura toda. Sem essa faixa, o texto
 * flutuava num vazio grande em ecras altos.
 */
import { useCallback, useId, useRef, useState } from 'react'

import { acceptDeEntrada, formatosDeEntrada } from '@/config/formats'
import styles from './DropZone.module.css'

type Props = {
  readonly onFicheiro: (file: File) => void
  readonly disabled?: boolean
}

export function DropZone({ onFicheiro, disabled = false }: Props) {
  const [sobreposto, setSobreposto] = useState(false)
  const inputId = useId()
  const contadorArrasto = useRef(0)

  const formatos = formatosDeEntrada()
    .map((f) => f.label)
    .join(', ')

  const receber = useCallback(
    (ficheiros: FileList | null) => {
      const primeiro = ficheiros?.[0]
      if (primeiro) onFicheiro(primeiro)
    },
    [onFicheiro],
  )

  // dragenter e dragleave disparam tambem nos filhos. Sem contador, a moldura
  // pisca ao passar por cima do texto interior.
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
    <div
      className={[styles.zona, sobreposto ? styles.sobreposto : '', disabled ? styles.inativo : '']
        .filter(Boolean)
        .join(' ')}
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
        if (!disabled) receber(evento.dataTransfer?.files ?? null)
      }}
    >
      <div className={styles.conteudo}>
        <div className={styles.texto}>
          <h1 className={styles.titulo}>Otimize e converta imagens no seu dispositivo</h1>
          <p className={styles.subtexto}>
            Escolha uma imagem, defina o formato e descarregue o resultado. Os ficheiros não são
            enviados para os nossos servidores.
          </p>

          <div className={styles.acoes}>
            <input
              id={inputId}
              type="file"
              className="visualmente-oculto"
              accept={acceptDeEntrada()}
              disabled={disabled}
              onChange={(evento) => {
                receber(evento.target.files)
                // Permite escolher o mesmo ficheiro outra vez depois de o remover.
                evento.target.value = ''
              }}
            />
            <label htmlFor={inputId} className={styles.botao}>
              Selecionar ficheiro
            </label>
            <span className={styles.ouArraste} aria-hidden="true">
              ou arraste para aqui
            </span>
          </div>
        </div>

        <div className={styles.faixa}>
          <p className={styles.grupoMeta}>
            <span className="etiqueta">Formatos aceites</span>
            <span className="numerico">{formatos}</span>
          </p>
          <p className={styles.grupoMeta}>
            <span className="etiqueta">Processamento</span>
            <span className={styles.valorMeta}>No seu browser</span>
          </p>
        </div>
      </div>
    </div>
  )
}
