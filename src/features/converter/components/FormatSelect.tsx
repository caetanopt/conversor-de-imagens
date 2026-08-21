'use client'

/**
 * Escolha do formato de destino.
 *
 * As opcoes vem do registry central, filtradas por `release`. Nenhum formato
 * aparece aqui porque alguem escreveu uma string num componente: ativar AVIF,
 * TIFF ou GIF e mudar um campo em config/formats.ts.
 * CLAUDE.md, seccao 5.
 */
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import { formatosDeSaida, type FormatId } from '@/config/formats'

type Props = {
  readonly valor: FormatId
  readonly onChange: (formato: FormatId) => void
  readonly disabled?: boolean
}

export function FormatSelect({ valor, onChange, disabled = false }: Props) {
  const opcoes = formatosDeSaida().map((formato) => ({
    value: formato.id,
    label: formato.label,
  }))

  return (
    <SegmentedControl
      legenda="Formato de destino"
      opcoes={opcoes}
      valor={valor}
      onChange={onChange}
      disabled={disabled}
    />
  )
}
