'use client'

/**
 * Escolha de tema: automatico, claro, escuro.
 *
 * Um botao que cicla, e nao tres botoes lado a lado. O cabecalho tem tres
 * elementos e a 360 px ja competem pela largura; um controlo segmentado de tres
 * opcoes empurrava algo para fora do ecra.
 *
 * O icone mostra o estado em vigor: sol, lua, ou meio circulo para automatico.
 * Acima de 520 px aparece tambem o nome em texto; abaixo fica so o icone,
 * porque a essa largura o nome nao cabe ao lado da marca e do indicador de
 * privacidade. O nome acessivel do botao diz sempre o estado por palavras e o
 * que o clique faz, portanto a forma nunca e a unica informacao disponivel.
 * CLAUDE.md, seccoes 20.4 e 21.
 *
 * O primeiro render assume o tema por defeito e o `useEffect` corrige-o a
 * partir do que esta guardado. Sem isso, o HTML gerado no build e o primeiro
 * render do browser divergiam. A paleta em si nao pisca, porque e aplicada
 * antes do paint pelo script do layout.
 */
import { useEffect, useState, type ReactElement } from 'react'

import {
  aplicarTema,
  guardarTema,
  lerTemaGuardado,
  proximoTema,
  ROTULOS,
  TEMA_POR_DEFEITO,
  type Tema,
} from '@/lib/tema/tema'
import { IconeAutomatico, IconeLua, IconeSol } from './IconesDeTema'
import styles from './ThemeToggle.module.css'

/** Um icone por estado. Fora daqui nenhum componente sabe que icone e qual. */
const ICONES: Record<Tema, (props: { readonly className?: string | undefined }) => ReactElement> = {
  sistema: IconeAutomatico,
  claro: IconeSol,
  escuro: IconeLua,
}

export function ThemeToggle() {
  const [tema, setTema] = useState<Tema>(TEMA_POR_DEFEITO)

  useEffect(() => {
    setTema(lerTemaGuardado())
  }, [])

  function escolher(): void {
    const seguinte = proximoTema(tema)
    setTema(seguinte)
    guardarTema(seguinte)
    aplicarTema(seguinte, document.documentElement)
  }

  const proximo = proximoTema(tema)
  const Icone = ICONES[tema]
  // Uma frase, usada no nome acessivel e na dica do rato. Sem ela, um botao que
  // cicla nao anuncia para onde vai.
  const descricao = `Tema: ${ROTULOS[tema].toLowerCase()}. Mudar para ${ROTULOS[proximo].toLowerCase()}.`

  return (
    <button
      type="button"
      className={styles.botao}
      onClick={escolher}
      aria-label={descricao}
      title={descricao}
    >
      <Icone className={styles.icone} />
      <span className={styles.valor}>{ROTULOS[tema]}</span>
    </button>
  )
}
