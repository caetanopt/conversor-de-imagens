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
import { calcularSaida } from '../state/resize'
import type { ResizeOptions } from '../types'
import styles from './ResizeControls.module.css'

type Props = {
  readonly valor: ResizeOptions | null
  readonly origem: { readonly width: number; readonly height: number } | null
  readonly onChange: (resize: ResizeOptions | null) => void
  readonly disabled?: boolean
  /**
   * Esconde o interruptor e mantem os campos sempre visiveis.
   *
   * Usado no modo 'redimensionar', onde o interruptor seria um segundo controlo
   * com o mesmo nome do modo e o mesmo significado. O modo E o interruptor.
   */
  readonly sempreAtivo?: boolean
}


const DESLIGADO: ResizeOptions = {
  width: null,
  height: null,
  preserveAspectRatio: true,
  allowUpscale: false,
}

export function ResizeControls({
  valor,
  origem,
  onChange,
  disabled = false,
  sempreAtivo = false,
}: Props) {
  const id = useId()
  const ativo = sempreAtivo || valor !== null
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
      {sempreAtivo ? null : (
        <label className={styles.ligar}>
          <input
            type="checkbox"
            checked={ativo}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked ? DESLIGADO : null)}
          />
          <span>Redimensionar</span>
        </label>
      )}

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
