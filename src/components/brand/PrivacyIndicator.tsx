'use client'

/**
 * Indicador de processamento local.
 *
 * Esta afirmacao so pode existir porque a arquitetura a sustenta: nao ha
 * endpoint de upload, a exportacao e estatica, a CSP restringe connect-src a
 * propria origem e um teste automatico falha se algum pedido de rede levar
 * bytes de imagem. Se alguma dessas garantias cair, este componente tem de
 * sair. CLAUDE.md, seccao 2.
 */
import { useId, useState } from 'react'
import styles from './PrivacyIndicator.module.css'

export function PrivacyIndicator() {
  const [aberto, setAberto] = useState(false)
  const detalheId = useId()

  return (
    <div className={styles.envolvente}>
      <button
        type="button"
        className={styles.gatilho}
        aria-expanded={aberto}
        aria-controls={detalheId}
        onClick={() => setAberto((v) => !v)}
      >
        <span className={styles.ponto} aria-hidden="true" />
        Processamento local
      </button>

      <div id={detalheId} className={styles.detalhe} hidden={!aberto}>
        As imagens são processadas no seu browser e não são enviadas para os nossos servidores.
        Não existe conta, base de dados nem histórico.
      </div>
    </div>
  )
}
