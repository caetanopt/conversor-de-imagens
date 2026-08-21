/**
 * Slot de marca.
 *
 * Nao existe logotipo. O manual de identidade ainda nao foi fornecido e o
 * CLAUDE.md proibe inventar simbolos de marca. Isto e uma marca nominativa em
 * texto, deliberadamente sobria, que sera substituida por um unico ficheiro
 * quando o logotipo real existir. Nenhum outro componente desenha marca.
 */
import styles from './BrandMark.module.css'

export function BrandMark() {
  return (
    <span className={styles.marca}>
      <span className={styles.nome}>Conversor de Imagens</span>
    </span>
  )
}
