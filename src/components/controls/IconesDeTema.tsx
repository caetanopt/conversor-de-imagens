/**
 * Icones do interruptor de tema: sol e lua.
 *
 * Desenhados a mao, sem biblioteca de icones. Sao duas formas geometricas
 * simples e uma dependencia so para isto nao se justificava; a seccao 31.13 do
 * CLAUDE.md pede que cada dependencia resolva um problema real.
 *
 * A geometria e calculada, nao estimada. O crescente e a interseccao de um
 * circulo de raio 9 centrado em (12,12) com um circulo de corte de raio 8,5
 * centrado em (18.5,6.5); os pontos onde os dois se cruzam sao (10.71, 3.09) e
 * (20.57, 14.74). Os raios do sol saem de 6,8 e vao a 9,6 a partir do centro,
 * em oito direccoes, para o conjunto ocupar a mesma caixa que a lua.
 *
 * O icone nunca carrega o significado sozinho: o interruptor tem `role="switch"`
 * com `aria-checked` e `aria-label`, que dizem o estado por palavras. A seccao
 * 20.4 do CLAUDE.md proibe depender apenas da cor, e uma forma sem alternativa
 * textual tinha o mesmo problema.
 */
type Props = {
  readonly className?: string | undefined
  /** Largura e altura em pixeis. O viewBox e sempre 24x24. */
  readonly tamanho?: number
}

/** Atributos comuns. `currentColor` para o icone seguir a cor do elemento pai. */
function comuns(className: string | undefined, tamanho: number) {
  return {
    viewBox: '0 0 24 24',
    width: tamanho,
    height: tamanho,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false as const,
    ...(className === undefined ? {} : { className }),
  }
}

export function IconeSol({ className, tamanho = 16 }: Props) {
  return (
    <svg {...comuns(className, tamanho)}>
      <circle cx="12" cy="12" r="4.2" />
      <line x1="18.80" y1="12.00" x2="21.60" y2="12.00" />
      <line x1="16.81" y1="16.81" x2="18.79" y2="18.79" />
      <line x1="12.00" y1="18.80" x2="12.00" y2="21.60" />
      <line x1="7.19" y1="16.81" x2="5.21" y2="18.79" />
      <line x1="5.20" y1="12.00" x2="2.40" y2="12.00" />
      <line x1="7.19" y1="7.19" x2="5.21" y2="5.21" />
      <line x1="12.00" y1="5.20" x2="12.00" y2="2.40" />
      <line x1="16.81" y1="7.19" x2="18.79" y2="5.21" />
    </svg>
  )
}

export function IconeLua({ className, tamanho = 16 }: Props) {
  return (
    <svg {...comuns(className, tamanho)}>
      <path d="M10.71 3.09A9 9 0 1 0 20.57 14.74A8.5 8.5 0 0 1 10.71 3.09Z" />
    </svg>
  )
}
