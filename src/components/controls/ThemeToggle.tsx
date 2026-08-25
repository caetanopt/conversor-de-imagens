'use client'

/**
 * Escolha de tema: automatico, claro, escuro.
 *
 * Um botao que cicla, e nao tres botoes lado a lado. O cabecalho tem tres
 * elementos e a 360 px ja competem pela largura; um controlo segmentado de tres
 * opcoes empurrava algo para fora do ecra. O botao mostra sempre o tema em
 * vigor como texto, portanto o estado nao depende de um icone nem de cor.
 * CLAUDE.md, seccoes 20.4 e 21.
 *
 * O primeiro render assume o tema por defeito e o `useEffect` corrige-o a
 * partir do que esta guardado. Sem isso, o HTML gerado no build e o primeiro
 * render do browser divergiam. A paleta em si nao pisca, porque e aplicada
 * antes do paint pelo script do layout.
 */
import { useEffect, useState } from 'react'

import {
  aplicarTema,
  guardarTema,
  lerTemaGuardado,
  proximoTema,
  ROTULOS,
  TEMA_POR_DEFEITO,
  type Tema,
} from '@/lib/tema/tema'
import styles from './ThemeToggle.module.css'

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

  return (
    <button
      type="button"
      className={styles.botao}
      onClick={escolher}
      // O nome acessivel diz o estado atual e o que o clique faz. Sem isto, um
      // botao que cicla nao anuncia para onde vai.
      aria-label={`Tema: ${ROTULOS[tema].toLowerCase()}. Mudar para ${ROTULOS[proximo].toLowerCase()}.`}
    >
      <span className={styles.etiqueta}>Tema</span>
      <span className={styles.valor}>{ROTULOS[tema]}</span>
    </button>
  )
}
