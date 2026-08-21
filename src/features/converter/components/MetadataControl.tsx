'use client'

/**
 * Politica de metadados.
 *
 * As tres opcoes vem de medicoes, nao de gosto. Ver docs/medicoes.md:
 * remover o perfil de cor de uma imagem AdobeRGB muda o vermelho de
 * RGB(220,30,40) para o que o browser interpreta como sRGB, o que e
 * visivelmente mais mate. Por isso o valor por defeito remove os dados
 * privados e mantem a cor.
 */
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import type { MetadataPolicy } from '../types'
import styles from './MetadataControl.module.css'

type Props = {
  readonly valor: MetadataPolicy
  readonly onChange: (politica: MetadataPolicy) => void
  readonly disabled?: boolean
}

const EXPLICACAO: Record<MetadataPolicy, string> = {
  'preservar-cor':
    'Remove localização GPS, data, equipamento, autor e legendas. Mantém o perfil de cor, para a imagem não mudar de aspeto.',
  remover:
    'Remove tudo, incluindo o perfil de cor. Ficheiro ligeiramente menor, mas as cores podem mudar se a imagem não estiver em sRGB.',
  manter: 'Não remove nada. A localização GPS e os dados do equipamento ficam no ficheiro.',
}

export function MetadataControl({ valor, onChange, disabled = false }: Props) {
  return (
    <div className={styles.envolvente}>
      <SegmentedControl
        legenda="Metadados"
        opcoes={[
          { value: 'preservar-cor', label: 'Remover, manter cor' },
          { value: 'remover', label: 'Remover tudo' },
          { value: 'manter', label: 'Manter tudo' },
        ]}
        valor={valor}
        onChange={onChange}
        disabled={disabled}
        orientacao="vertical"
      />
      <p className={valor === 'manter' ? styles.aviso : styles.explicacao}>{EXPLICACAO[valor]}</p>
    </div>
  )
}
