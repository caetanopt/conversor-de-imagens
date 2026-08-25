'use client'

/**
 * Interruptor de tema: claro ou escuro.
 *
 * Um interruptor binario (`role="switch"`), sem texto, so os dois icones. Um
 * ciclo de tres estados como antes nao cabe na metafora de um interruptor, que
 * e sempre ligado ou desligado; e o cabecalho a 360 px nao tem largura para uma
 * etiqueta ao lado.
 *
 * A preferencia do sistema continua a ser respeitada exatamente como antes:
 * quem nunca mexe no interruptor ve a paleta do `prefers-color-scheme`, porque
 * o script em `layout.tsx` so aplica um atributo quando existe uma escolha
 * explicita guardada. O interruptor mexer em algo que ainda nao foi escolhido
 * comeca do lado que o sistema prefere NESSE momento, e nao de um lado fixo, o
 * que evita o interruptor "saltar" de posicao ao primeiro toque. Um ouvinte de
 * `matchMedia` mantem essa posicao correta se o sistema mudar de tema enquanto
 * a pagina esta aberta e o utilizador ainda nao escolheu de forma explicita.
 *
 * Depois do primeiro clique a escolha fica explicita e guardada; o interruptor
 * deixa de seguir o sistema a partir dai, tal como qualquer interruptor de
 * tema no browser. A UNICA forma de voltar a seguir o sistema volta a ser
 * limpar o valor guardado.
 *
 * O primeiro render assume o tema por defeito e o `useEffect` corrige-o a
 * partir do que esta guardado. Sem isso, o HTML gerado no build e o primeiro
 * render do browser divergiam. A paleta em si nao pisca, porque e aplicada
 * antes do paint pelo script do layout.
 */
import { useEffect, useState } from 'react'

import { aplicarTema, guardarTema, lerTemaGuardado, TEMA_POR_DEFEITO, type Tema } from '@/lib/tema/tema'
import { IconeLua, IconeSol } from './IconesDeTema'
import styles from './ThemeToggle.module.css'

const CONSULTA_ESCURO = '(prefers-color-scheme: dark)'

/** O booleano que o interruptor mostra. 'sistema' resolve para o que o SO prefere agora. */
function escuroResolvido(tema: Tema, sistemaPrefereEscuro: boolean): boolean {
  if (tema === 'escuro') return true
  if (tema === 'claro') return false
  return sistemaPrefereEscuro
}

export function ThemeToggle() {
  const [tema, setTema] = useState<Tema>(TEMA_POR_DEFEITO)
  const [sistemaPrefereEscuro, setSistemaPrefereEscuro] = useState(false)

  useEffect(() => {
    setTema(lerTemaGuardado())

    const consulta = window.matchMedia(CONSULTA_ESCURO)
    setSistemaPrefereEscuro(consulta.matches)

    function aoMudarSistema(evento: MediaQueryListEvent): void {
      setSistemaPrefereEscuro(evento.matches)
    }
    consulta.addEventListener('change', aoMudarSistema)
    return () => consulta.removeEventListener('change', aoMudarSistema)
  }, [])

  const escuro = escuroResolvido(tema, sistemaPrefereEscuro)

  function alternar(): void {
    const seguinte: Tema = escuro ? 'claro' : 'escuro'
    setTema(seguinte)
    guardarTema(seguinte)
    aplicarTema(seguinte, document.documentElement)
  }

  // Diz o estado atual e o que o clique faz, tal como qualquer switch: o nome
  // acessivel nao pode depender so da posicao visual do polegar.
  const descricao = escuro ? 'Tema escuro. Mudar para tema claro.' : 'Tema claro. Mudar para tema escuro.'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={escuro}
      className={styles.interruptor}
      onClick={alternar}
      aria-label={descricao}
      title={descricao}
    >
      <span className={styles.trilho}>
        <IconeSol className={styles.iconeSol} tamanho={16} />
        <IconeLua className={styles.iconeLua} tamanho={16} />
        <span className={styles.polegar} aria-hidden="true" />
      </span>
    </button>
  )
}
