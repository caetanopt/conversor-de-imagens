/**
 * FileQueueItem: ligacao entre os controlos da linha e o erro do ficheiro.
 *
 * role="alert" anuncia o erro no instante em que aparece, mas um utilizador
 * de leitor de ecra que volte a esta linha mais tarde (a meio de um lote, com
 * a atencao noutro ficheiro) so tem essa informacao se os controlos
 * apontarem para ela via aria-describedby. CLAUDE.md, seccao 20.6.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { criarJob } from '@/features/converter/state/jobsReducer'
import type { ImageJob, JobError } from '@/features/converter/types'
import { FileQueueItem } from '@/features/converter/components/FileQueueItem'

afterEach(() => {
  cleanup()
})

function ficheiro(nome = 'foto.jpg'): File {
  return new File([new Uint8Array(1000)], nome, { type: 'image/jpeg' })
}

const ERRO: JobError = {
  kind: 'falha-de-conversao',
  message: 'Não foi possível processar esta imagem.',
}

function jobComErro(): ImageJob {
  const base = criarJob(ficheiro(), 'jpeg', 'webp')
  return { ...base, status: 'error', error: ERRO }
}

const SEM_ACAO = { onSelecionar: vi.fn(), onRemover: vi.fn(), onCancelar: vi.fn(), onDescarregar: vi.fn() }

describe('FileQueueItem', () => {
  it('liga o botao Remover e o seletor ao erro via aria-describedby', () => {
    const job = jobComErro()
    render(<FileQueueItem job={job} selecionado lote {...SEM_ACAO} />)

    const alerta = screen.getByRole('alert')
    expect(alerta.id).toBeTruthy()

    const remover = screen.getByRole('button', { name: `Remover ${job.sourceName}` })
    expect(remover.getAttribute('aria-describedby')).toBe(alerta.id)

    const seletor = screen.getByRole('button', { name: job.sourceName })
    expect(seletor.getAttribute('aria-describedby')).toBe(alerta.id)
  })

  it('sem erro, os controlos nao apontam para nenhuma descricao', () => {
    const job = criarJob(ficheiro(), 'jpeg', 'webp')
    render(<FileQueueItem job={job} selecionado lote {...SEM_ACAO} />)

    expect(screen.queryByRole('alert')).toBeNull()
    const remover = screen.getByRole('button', { name: `Remover ${job.sourceName}` })
    expect(remover.hasAttribute('aria-describedby')).toBe(false)
  })
})
