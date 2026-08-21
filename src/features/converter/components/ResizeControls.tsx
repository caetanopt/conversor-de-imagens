'use client'

/**
 * Redimensionamento.
 *
 * Duas decisoes que evitam surpresas, ambas exigidas pelo CLAUDE.md, seccao 11:
 *
 *  - a proporcao e preservada por defeito, e o campo calculado mostra o valor
 *    que vai sair em vez de ficar vazio;
 *  - imagens pequenas nao sao aumentadas por defeito, porque esticar pixels nao
 *    acrescenta detalhe.
 *
 * O motor trata as dimensoes como caixa delimitadora, portanto preservar a
 * proporcao e o comportamento que nao custa nada. Ver docs/formatos.md.
 */
import { useId } from 'react'

import { formatarDimensoes } from '@/lib/format/bytes'
import type { ResizeOptions } from '../types'
import styles from './ResizeControls.module.css'

type Props = {
  readonly valor: ResizeOptions | null
  readonly origem: { readonly width: number; readonly height: number } | null
  readonly onChange: (resize: ResizeOptions | null) => void
  readonly disabled?: boolean
}

/** Dimensoes que o motor vai produzir, para o utilizador ver antes de converter. */
export function calcularSaida(
  origem: { width: number; height: number },
  resize: ResizeOptions | null,
): { width: number; height: number } {
  if (!resize || (resize.width === null && resize.height === null)) return origem

  if (!resize.preserveAspectRatio) {
    return {
      width: resize.width ?? origem.width,
      height: resize.height ?? origem.height,
    }
  }

  // Caixa delimitadora: a imagem cabe dentro das dimensoes pedidas.
  const limiteLargura = resize.width ?? Number.POSITIVE_INFINITY
  const limiteAltura = resize.height ?? Number.POSITIVE_INFINITY
  let escala = Math.min(limiteLargura / origem.width, limiteAltura / origem.height)

  // Nao aumentar imagens pequenas, salvo pedido explicito.
  if (!resize.allowUpscale) escala = Math.min(escala, 1)

  return {
    width: Math.max(1, Math.round(origem.width * escala)),
    height: Math.max(1, Math.round(origem.height * escala)),
  }
}

const DESLIGADO: ResizeOptions = {
  width: null,
  height: null,
  preserveAspectRatio: true,
  allowUpscale: false,
}

export function ResizeControls({ valor, origem, onChange, disabled = false }: Props) {
  const id = useId()
  const ativo = valor !== null
  const resize = valor ?? DESLIGADO

  const saida = origem ? calcularSaida(origem, ativo ? resize : null) : null
  const aumentaria =
    origem !== null &&
    ((resize.width !== null && resize.width > origem.width) ||
      (resize.height !== null && resize.height > origem.height))

  function atualizar(parcial: Partial<ResizeOptions>) {
    onChange({ ...resize, ...parcial })
  }

  function lerNumero(bruto: string): number | null {
    if (bruto.trim() === '') return null
    const n = Number(bruto)
    if (!Number.isFinite(n) || n <= 0) return null
    return Math.min(30_000, Math.round(n))
  }

  return (
    <div className={styles.envolvente}>
      <label className={styles.ligar}>
        <input
          type="checkbox"
          checked={ativo}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked ? DESLIGADO : null)}
        />
        <span>Redimensionar</span>
      </label>

      {ativo ? (
        <>
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
                max={30_000}
                value={resize.width ?? ''}
                placeholder="auto"
                disabled={disabled}
                onChange={(e) => atualizar({ width: lerNumero(e.target.value) })}
              />
            </div>

            <span className={styles.separador} aria-hidden="true">
              x
            </span>

            <div className={styles.campo}>
              <label htmlFor={`${id}-altura`} className="etiqueta">
                Altura
              </label>
              <input
                id={`${id}-altura`}
                type="number"
                className={`${styles.numero} numerico`}
                min={1}
                max={30_000}
                value={resize.height ?? ''}
                placeholder="auto"
                disabled={disabled}
                onChange={(e) => atualizar({ height: lerNumero(e.target.value) })}
              />
            </div>
          </div>

          <label className={styles.opcao}>
            <input
              type="checkbox"
              checked={resize.preserveAspectRatio}
              disabled={disabled}
              onChange={(e) => atualizar({ preserveAspectRatio: e.target.checked })}
            />
            <span>Preservar proporção</span>
          </label>

          <label className={styles.opcao}>
            <input
              type="checkbox"
              checked={resize.allowUpscale}
              disabled={disabled}
              onChange={(e) => atualizar({ allowUpscale: e.target.checked })}
            />
            <span>Permitir aumentar</span>
          </label>

          {origem && saida ? (
            <p className={styles.previsao}>
              <span className="etiqueta">Resultado</span>
              <span className="numerico">
                {formatarDimensoes(origem.width, origem.height)} para{' '}
                {formatarDimensoes(saida.width, saida.height)}
              </span>
            </p>
          ) : null}

          {aumentaria && !resize.allowUpscale ? (
            <p className={styles.aviso}>
              As dimensões pedidas são maiores que o original. Sem permitir aumentar, a imagem
              mantém o tamanho.
            </p>
          ) : null}
        </>
      ) : (
        <p className={styles.explicacao}>A imagem mantém as dimensões originais.</p>
      )}
    </div>
  )
}
