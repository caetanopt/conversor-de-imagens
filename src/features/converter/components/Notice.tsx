/**
 * Bloco de aviso do painel de definicoes.
 *
 * Puramente visual. Existe porque ja ha duas coisas a dizer sobre o que o
 * formato de destino vai fazer (fotogramas e limite de dimensao), e mais do
 * que um bloco com o mesmo aspeto exigiria duplicar o estilo.
 *
 * A distincao entre os dois tipos e reforcada pela barra a esquerda e pelo
 * texto, nunca apenas pela cor. CLAUDE.md, seccao 20.4.
 */
import type { ReactNode } from 'react'

import styles from './Notice.module.css'

type Props = {
  /** 'perda' quando algo se vai perder, 'informacao' quando e so contexto. */
  readonly tipo: 'perda' | 'informacao'
  readonly children: ReactNode
}

export function Notice({ tipo, children }: Props) {
  return <div className={tipo === 'perda' ? styles.perda : styles.informacao}>{children}</div>
}

export function NoticeMessage({ children }: { readonly children: ReactNode }) {
  return <p className={styles.mensagem}>{children}</p>
}

export function NoticeDetail({ children }: { readonly children: ReactNode }) {
  return <p className={styles.detalhe}>{children}</p>
}
