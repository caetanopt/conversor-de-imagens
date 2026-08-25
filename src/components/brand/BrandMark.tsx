/**
 * Marca no cabecalho: lettering oficial da Caetano mais o nome do produto.
 *
 * O lettering vem de `CaetanoLettering`, extraido em vetor do manual. Este
 * componente nao desenha marca nenhuma: so a compoe com o nome do produto e
 * garante a area de seguranca que o manual exige a volta do lettering
 * (pagina 6), aqui dada pelo espacamento e pelo separador.
 *
 * O nome do produto fica em peso normal e a cor discreta, para nao competir
 * com o lettering. A Caetano e a marca; "Conversor de Imagens" e o produto.
 *
 * Nenhum outro componente desenha marca.
 */
import { CaetanoLettering } from './CaetanoLettering'
import styles from './BrandMark.module.css'

export function BrandMark() {
  return (
    <span className={styles.marca}>
      {/*
        20 px em ecra largo e 16 px em ecra estreito, ambos acima do minimo de
        14 px que o manual fixa para digital. A altura vem do CSS, nao da prop,
        para poder responder a media query.
      */}
      <CaetanoLettering className={styles.lettering} />
      <span aria-hidden="true" className={styles.separador} />
      <span className={styles.produto}>Conversor de Imagens</span>
    </span>
  )
}
