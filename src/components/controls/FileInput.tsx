'use client'

/**
 * Entrada de ficheiros.
 *
 * Extraido da DropZone quando o lote entrou: depois de existirem ficheiros na
 * fila, a zona de largar desaparece do ecra e sem isto nao havia forma de
 * adicionar mais imagens.
 *
 * O input esta associado a uma etiqueta real em vez de ser acionado por
 * codigo, para funcionar por teclado sem gestos artificiais.
 * CLAUDE.md, seccao 20.5.
 */
import { useId, type ReactNode } from 'react'

import { acceptDeEntrada } from '@/config/formats'

type Props = {
  readonly onFicheiros: (ficheiros: File[]) => void
  readonly children: ReactNode
  /**
   * `string | undefined` explicito: com exactOptionalPropertyTypes e
   * noUncheckedIndexedAccess, uma classe vinda de um CSS module e
   * `string | undefined` e nao passaria por `className?: string`.
   */
  readonly className?: string | undefined
  readonly disabled?: boolean
  readonly multiple?: boolean
}

export function FileInput({
  onFicheiros,
  children,
  className,
  disabled = false,
  multiple = true,
}: Props) {
  const inputId = useId()

  return (
    <>
      <input
        id={inputId}
        type="file"
        className="visualmente-oculto"
        accept={acceptDeEntrada()}
        multiple={multiple}
        disabled={disabled}
        onChange={(evento) => {
          const ficheiros = Array.from(evento.target.files ?? [])
          if (ficheiros.length > 0) onFicheiros(ficheiros)
          // Permite escolher o mesmo ficheiro outra vez depois de o remover.
          evento.target.value = ''
        }}
      />
      <label htmlFor={inputId} {...(className === undefined ? {} : { className })}>
        {children}
      </label>
    </>
  )
}
