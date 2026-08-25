import { ThemeToggle } from '@/components/controls/ThemeToggle'
import { BrandMark } from './BrandMark'
import { PrivacyIndicator } from './PrivacyIndicator'
import styles from './AppHeader.module.css'

/**
 * Cabecalho compacto. A ferramenta e o elemento principal da pagina, por isso
 * o cabecalho ocupa o minimo e nao ha hero nem texto de marketing acima dela.
 * CLAUDE.md, seccoes 13 e 26.
 */
export function AppHeader() {
  return (
    <header className={styles.cabecalho}>
      <BrandMark />
      <div className={styles.acoes}>
        <ThemeToggle />
        <PrivacyIndicator />
      </div>
    </header>
  )
}
