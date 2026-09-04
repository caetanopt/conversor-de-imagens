'use client'

/**
 * Sobreposicao de corte, sobre a pre-visualizacao.
 *
 * Replica o gesto da ferramenta do Photoshop: oito manipulos, arrastar por
 * dentro para mover, area de fora escurecida, e grelha de tercos. O que NAO
 * replica e o modelo destrutivo do Photoshop: aqui nao existe "excluir pixeis",
 * porque a conversao produz sempre um ficheiro novo e o original nunca e tocado.
 *
 * Tres decisoes que decidem se isto funciona:
 *
 *  1. As coordenadas guardadas sao pixeis da IMAGEM, nao do ecra. A
 *     pre-visualizacao e uma miniatura e o seu tamanho depende da janela;
 *     guardar pixeis de ecra fazia o corte mudar ao redimensionar o browser.
 *     A escala e recalculada a cada gesto a partir do retangulo real do <img>.
 *
 *  2. Pointer events e nao mouse events, com `setPointerCapture`. Cobre rato,
 *     dedo e caneta com um caminho so, e o arrasto sobrevive a sair da area.
 *
 *  3. O gesto parte SEMPRE do retangulo em que comecou, guardado em
 *     `gestoRef`, e nao do estado atual. Acumular deltas sobre o resultado
 *     anterior faz o corte derivar quando a travagem nos limites entra, porque
 *     cada passo perde a parte do movimento que foi travada.
 *
 * Acessibilidade: arrastar nao pode ser a unica via. CLAUDE.md, seccao 20.1.
 * O retangulo e os manipulos sao focaveis e respondem as setas; os campos
 * numericos do painel sao a via completa por teclado.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  moverCorte,
  redimensionarPorManipulo,
  valorDaProporcao,
  type CropRect,
  type Limites,
  type Manipulo,
  type ProporcaoId,
} from '../state/crop'
import styles from './CropOverlay.module.css'

/** Passo das setas. Com Shift salta mais, como em qualquer editor. */
const PASSO = 1
const PASSO_GRANDE = 10

const MANIPULOS: readonly { readonly id: Manipulo; readonly rotulo: string }[] = [
  { id: 'noroeste', rotulo: 'canto superior esquerdo' },
  { id: 'norte', rotulo: 'lado superior' },
  { id: 'nordeste', rotulo: 'canto superior direito' },
  { id: 'oeste', rotulo: 'lado esquerdo' },
  { id: 'este', rotulo: 'lado direito' },
  { id: 'sudoeste', rotulo: 'canto inferior esquerdo' },
  { id: 'sul', rotulo: 'lado inferior' },
  { id: 'sudeste', rotulo: 'canto inferior direito' },
]

type Props = {
  readonly rect: CropRect
  readonly limites: Limites
  readonly aspect: ProporcaoId
  readonly onChange: (rect: CropRect) => void
  readonly disabled?: boolean
}

type Gesto = {
  readonly manipulo: Manipulo | 'mover'
  readonly inicioX: number
  readonly inicioY: number
  readonly rectInicial: CropRect
  readonly escala: number
}

export function CropOverlay({ rect, limites, aspect, onChange, disabled = false }: Props) {
  const areaRef = useRef<HTMLDivElement | null>(null)
  const gestoRef = useRef<Gesto | null>(null)
  const [aArrastar, setAArrastar] = useState(false)

  const proporcao = valorDaProporcao(aspect, limites)

  /**
   * Pixeis de imagem por pixel de ecra.
   *
   * Lido do DOM a cada gesto em vez de guardado: a area muda de tamanho com a
   * janela e com o painel a abrir e fechar, e uma escala em cache produzia um
   * corte que salta.
   */
  const escalaAtual = useCallback((): number => {
    const area = areaRef.current
    if (!area) return 1
    const caixa = area.getBoundingClientRect()
    if (caixa.width <= 0) return 1
    return limites.width / caixa.width
  }, [limites.width])

  const aplicar = useCallback(
    (clientX: number, clientY: number) => {
      const gesto = gestoRef.current
      if (!gesto) return

      const dx = (clientX - gesto.inicioX) * gesto.escala
      const dy = (clientY - gesto.inicioY) * gesto.escala

      const novo =
        gesto.manipulo === 'mover'
          ? moverCorte(gesto.rectInicial, dx, dy, limites)
          : redimensionarPorManipulo(gesto.rectInicial, gesto.manipulo, dx, dy, limites, proporcao)

      onChange(novo)
    },
    [limites, onChange, proporcao],
  )

  const comecar = useCallback(
    (evento: React.PointerEvent, manipulo: Manipulo | 'mover') => {
      if (disabled) return
      evento.preventDefault()
      evento.stopPropagation()
      // O alvo capta o ponteiro: o arrasto continua mesmo por fora da area.
      evento.currentTarget.setPointerCapture(evento.pointerId)
      gestoRef.current = {
        manipulo,
        inicioX: evento.clientX,
        inicioY: evento.clientY,
        rectInicial: rect,
        escala: escalaAtual(),
      }
      setAArrastar(true)
    },
    [disabled, escalaAtual, rect],
  )

  const mover = useCallback(
    (evento: React.PointerEvent) => {
      if (!gestoRef.current) return
      evento.preventDefault()
      // Os manipulos vivem DENTRO da janela, portanto o evento sobe ate ela.
      // Sem travar aqui, cada movimento era tratado duas vezes.
      evento.stopPropagation()
      aplicar(evento.clientX, evento.clientY)
    },
    [aplicar],
  )

  const terminar = useCallback((evento: React.PointerEvent) => {
    if (!gestoRef.current) return
    evento.stopPropagation()
    gestoRef.current = null
    setAArrastar(false)
    if (evento.currentTarget.hasPointerCapture(evento.pointerId)) {
      evento.currentTarget.releasePointerCapture(evento.pointerId)
    }
  }, [])

  // Um gesto interrompido por outra via (Escape, perda de foco da janela) nao
  // pode deixar o overlay preso no estado de arrasto.
  useEffect(() => {
    if (!aArrastar) return
    const cancelar = () => {
      gestoRef.current = null
      setAArrastar(false)
    }
    window.addEventListener('blur', cancelar)
    return () => window.removeEventListener('blur', cancelar)
  }, [aArrastar])

  const porTeclado = useCallback(
    (evento: React.KeyboardEvent, manipulo: Manipulo | 'mover') => {
      if (disabled) return
      const passo = evento.shiftKey ? PASSO_GRANDE : PASSO
      const delta: Record<string, readonly [number, number]> = {
        ArrowLeft: [-passo, 0],
        ArrowRight: [passo, 0],
        ArrowUp: [0, -passo],
        ArrowDown: [0, passo],
      }
      const d = delta[evento.key]
      if (!d) return
      evento.preventDefault()
      /*
       * Travar a subida e obrigatorio, nao arrumacao.
       *
       * Os manipulos sao filhos da janela, e a janela tambem escuta as setas
       * para se mover. Sem isto, uma seta num manipulo disparava as duas
       * chamadas a partir do MESMO retangulo, e a segunda (mover) sobrepunha o
       * resultado da primeira (redimensionar). O efeito visivel era teclado sem
       * efeito nenhum: medido, 1200x675 antes e 1200x675 depois de cinco setas.
       */
      evento.stopPropagation()
      const [dx, dy] = d
      onChange(
        manipulo === 'mover'
          ? moverCorte(rect, dx, dy, limites)
          : redimensionarPorManipulo(rect, manipulo, dx, dy, limites, proporcao),
      )
    },
    [disabled, limites, onChange, proporcao, rect],
  )

  // Percentagens e nao pixeis: a area redimensiona com a janela e o corte
  // acompanha sem recalcular nada em JavaScript.
  const pct = (valor: number, total: number) => `${(valor / total) * 100}%`
  const estiloDaJanela = {
    left: pct(rect.x, limites.width),
    top: pct(rect.y, limites.height),
    width: pct(rect.width, limites.width),
    height: pct(rect.height, limites.height),
  }

  return (
    <div
      ref={areaRef}
      className={[styles.area, aArrastar ? styles.aArrastar : ''].filter(Boolean).join(' ')}
      data-testid="corte-area"
    >
      {/* Escurece o que fica de fora. Quatro faixas em vez de uma mascara SVG:
          menos codigo e funciona em qualquer browser alvo. */}
      <div className={styles.veu} style={{ inset: `0 0 ${pct(limites.height - rect.y, limites.height)} 0` }} />
      <div className={styles.veu} style={{ inset: `${pct(rect.y + rect.height, limites.height)} 0 0 0` }} />
      <div
        className={styles.veu}
        style={{
          inset: `${pct(rect.y, limites.height)} ${pct(limites.width - rect.x, limites.width)} ${pct(limites.height - rect.y - rect.height, limites.height)} 0`,
        }}
      />
      <div
        className={styles.veu}
        style={{
          inset: `${pct(rect.y, limites.height)} 0 ${pct(limites.height - rect.y - rect.height, limites.height)} ${pct(rect.x + rect.width, limites.width)}`,
        }}
      />

      <div
        className={styles.janela}
        style={estiloDaJanela}
        role="application"
        tabIndex={disabled ? -1 : 0}
        aria-label={`Área de corte, ${rect.width} por ${rect.height} pixéis, a começar em ${rect.x}, ${rect.y}. Use as setas para mover.`}
        onPointerDown={(e) => comecar(e, 'mover')}
        onPointerMove={mover}
        onPointerUp={terminar}
        onPointerCancel={terminar}
        onKeyDown={(e) => porTeclado(e, 'mover')}
      >
        {/* Grelha de tercos. Decorativa para o leitor de ecra, funcional para
            quem enquadra: e a razao de existir no Photoshop. */}
        <div className={styles.grelha} aria-hidden="true">
          <span className={styles.linhaV} style={{ left: '33.333%' }} />
          <span className={styles.linhaV} style={{ left: '66.666%' }} />
          <span className={styles.linhaH} style={{ top: '33.333%' }} />
          <span className={styles.linhaH} style={{ top: '66.666%' }} />
        </div>

        {MANIPULOS.map(({ id, rotulo }) => (
          <button
            key={id}
            type="button"
            className={`${styles.manipulo} ${styles[id]}`}
            aria-label={`Ajustar o ${rotulo}`}
            disabled={disabled}
            onPointerDown={(e) => comecar(e, id)}
            onPointerMove={mover}
            onPointerUp={terminar}
            onPointerCancel={terminar}
            onKeyDown={(e) => porTeclado(e, id)}
          />
        ))}
      </div>
    </div>
  )
}
