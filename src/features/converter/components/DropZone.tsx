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
import { useCallback, useRef, useState } from 'react'

import { FileInput } from '@/components/controls/FileInput'
import { formatosDeEntrada } from '@/config/formats'
import { LIMITES } from '@/config/limits'
import styles from './DropZone.module.css'

type Props = {
  readonly onFicheiros: (ficheiros: File[]) => void
  readonly disabled?: boolean
}

export function DropZone({ onFicheiros, disabled = false }: Props) {
  const [sobreposto, setSobreposto] = useState(false)
  const contadorArrasto = useRef(0)

  const formatos = formatosDeEntrada()
    .map((f) => f.label)
    .join(', ')

  const receber = useCallback(
    (lista: FileList | null) => {
      const ficheiros = Array.from(lista ?? [])
      if (ficheiros.length > 0) onFicheiros(ficheiros)
    },
    [onFicheiros],
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
        {/*
          Dois paineis separados, nao um a envolver o outro: assim o espaco a
          direita do bloco de texto, mais estreito que a faixa, fica fora de
          ambos e mostra a fotografia sem fundo por cima. Ver o comentario em
          DropZone.module.css.
        */}
        <div className={`${styles.painel} ${styles.texto}`}>
          <h1 className={styles.titulo}>Otimize e converta imagens no seu dispositivo</h1>
          <p className={styles.subtexto}>
            Escolha as imagens, defina o formato e descarregue o resultado. Os ficheiros não são
            enviados para os nossos servidores.
          </p>

          <div className={styles.acoes}>
            <FileInput onFicheiros={onFicheiros} className={styles.botao} disabled={disabled}>
              Selecionar ficheiros
            </FileInput>
            <span className={styles.ouArraste} aria-hidden="true">
              ou arraste para aqui
            </span>
          </div>
        </div>

        <div className={`${styles.painel} ${styles.faixa}`}>
          <p className={styles.grupoMeta}>
            <span className="etiqueta">Formatos aceites</span>
            <span className="numerico">{formatos}</span>
          </p>
          <p className={styles.grupoMeta}>
            <span className="etiqueta">De cada vez</span>
            <span className={styles.valorMeta}>Até {LIMITES.maxFicheiros} imagens</span>
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
