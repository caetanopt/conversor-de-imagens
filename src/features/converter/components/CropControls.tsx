'use client'

/**
 * Controlos do corte.
 *
 * Espelha a barra da ferramenta do Photoshop no que faz sentido aqui:
 * proporcao, largura, altura, troca e reposicao. Fica de fora o "excluir
 * pixeis", porque aqui nao existe escolha: a conversao produz sempre um
 * ficheiro novo e o original nao e tocado. E fica de fora o "corrigir"
 * (endireitar), que e rotacao e nao corte.
 *
 * Os campos numericos nao sao um extra: sao a via completa por teclado para
 * quem nao pode arrastar. CLAUDE.md, seccao 20.1 e 20.5.
 */
import { useId } from 'react'

import { Button } from '@/components/controls/Button'
import { formatarDimensoes } from '@/lib/format/bytes'
import {
  corteInicial,
  corteParaProporcao,
  definirDimensoes,
  proporcaoDoCorte,
  PROPORCOES,
  trocarDimensoes,
  valorDaProporcao,
  type CropRect,
  type Limites,
  type ProporcaoId,
} from '../state/crop'
import styles from './CropControls.module.css'

type Props = {
  readonly crop: CropRect | null
  readonly aspect: ProporcaoId
  readonly origem: Limites | null
  readonly onCorte: (crop: CropRect | null) => void
  readonly onProporcao: (aspect: ProporcaoId) => void
  readonly disabled?: boolean
}

export function CropControls({
  crop,
  aspect,
  origem,
  onCorte,
  onProporcao,
  disabled = false,
}: Props) {
  const id = useId()

  if (!origem) {
    return (
      <div className={styles.envolvente}>
        <p className={styles.explicacao}>
          O corte fica disponível quando a imagem tiver sido analisada.
        </p>
      </div>
    )
  }

  // Fixado num const depois da guarda: o estreitamento de um prop nao
  // atravessa a fronteira de `mudarProporcao`, porque TypeScript nao pode
  // assumir que um prop nao muda entre as duas leituras.
  const limites: Limites = origem
  const ativo = crop !== null
  const rect = crop ?? corteInicial(limites)
  const proporcao = valorDaProporcao(aspect, limites)

  function lerNumero(bruto: string): number | null {
    if (bruto.trim() === '') return null
    const n = Number(bruto)
    if (!Number.isFinite(n) || n <= 0) return null
    return Math.round(n)
  }

  function mudarProporcao(novo: ProporcaoId) {
    onProporcao(novo)
    if (!ativo) return
    // Escolher uma proporcao reenquadra logo, como no Photoshop, em vez de
    // esperar pelo proximo arrasto.
    const valor = valorDaProporcao(novo, limites)
    onCorte(valor === null ? rect : corteParaProporcao(limites, valor))
  }

  return (
    <div className={styles.envolvente}>
      <label className={styles.ligar}>
        <input
          type="checkbox"
          checked={ativo}
          disabled={disabled}
          onChange={(e) => onCorte(e.target.checked ? corteInicial(limites) : null)}
        />
        <span>Cortar</span>
      </label>

      {ativo ? (
        <>
          <div className={styles.campo}>
            <label htmlFor={`${id}-proporcao`} className="etiqueta">
              Proporção
            </label>
            <select
              id={`${id}-proporcao`}
              className={styles.selecao}
              value={aspect}
              disabled={disabled}
              onChange={(e) => mudarProporcao(e.target.value as ProporcaoId)}
            >
              {PROPORCOES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.dimensoes}>
            <div className={styles.campo}>
              <label htmlFor={`${id}-largura`} className="etiqueta">
                Largura
              </label>
              <input
                id={`${id}-largura`}
                type="number"
                className={`${styles.numero} numerico`}
                min={1}
                max={limites.width}
                value={rect.width}
                disabled={disabled}
                onChange={(e) =>
                  onCorte(definirDimensoes(rect, lerNumero(e.target.value), null, limites, proporcao))
                }
              />
            </div>

            <Button
              variante="secundario"
              onClick={() => onCorte(trocarDimensoes(rect, limites))}
              disabled={disabled}
              aria-label="Trocar largura por altura"
            >
              <span aria-hidden="true">⇄</span>
            </Button>

            <div className={styles.campo}>
              <label htmlFor={`${id}-altura`} className="etiqueta">
                Altura
              </label>
              <input
                id={`${id}-altura`}
                type="number"
                className={`${styles.numero} numerico`}
                min={1}
                max={limites.height}
                value={rect.height}
                disabled={disabled}
                onChange={(e) =>
                  onCorte(definirDimensoes(rect, null, lerNumero(e.target.value), limites, proporcao))
                }
              />
            </div>
          </div>

          <p className={styles.previsao}>
            <span className="etiqueta">Resultado</span>
            <span className="numerico">
              {formatarDimensoes(limites.width, limites.height)} para{' '}
              {formatarDimensoes(rect.width, rect.height)}
            </span>
            <span className={styles.proporcaoLida}>proporção {proporcaoDoCorte(rect)}</span>
          </p>

          <div className={styles.acoes}>
            <Button
              variante="secundario"
              onClick={() => onCorte(corteInicial(limites))}
              disabled={disabled}
            >
              Repor
            </Button>
          </div>

          <p className={styles.nota}>
            Arraste a área na pré-visualização, ou use as setas com a área selecionada. As
            dimensões são em pixéis da imagem original.
          </p>
        </>
      ) : (
        <p className={styles.explicacao}>A imagem é convertida por inteiro.</p>
      )}
    </div>
  )
}
