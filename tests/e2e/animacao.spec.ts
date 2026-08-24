import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

/**
 * Animacao e formatos novos, no browser.
 *
 * O motor ja esta coberto por tests/unit/animacao.test.ts. O que se verifica
 * aqui e a outra metade da regra do CLAUDE.md, seccao 5.8: o utilizador e
 * avisado ANTES de converter, e o aviso muda quando o destino muda.
 */

const FIXTURES = resolve(import.meta.dirname, '../fixtures')
const GIF_ANIMADO = resolve(FIXTURES, 'gif-animado.gif')
const GIF_ESTATICO = resolve(FIXTURES, 'gif-estatico.gif')
const BMP = resolve(FIXTURES, 'bmp-rgb.bmp')

const ESPERA_LONGA = { timeout: 120_000 }

async function carregar(page: Page, ficheiro: string): Promise<void> {
  await page.goto('/')
  await page.setInputFiles('input[type="file"]', ficheiro)
  await expect(page.getByRole('button', { name: /^Converter para/ })).toBeEnabled(ESPERA_LONGA)
}

test.describe('aviso de animacao antes de converter', () => {
  test('um GIF animado avisa que PNG perde a animacao, e sugere alternativas', async ({ page }) => {
    await carregar(page, GIF_ANIMADO)

    // O destino sugerido para um GIF e WebP, que preserva.
    await expect(page.getByText(/preserva a animação/)).toBeVisible()

    await page.getByRole('radio', { name: 'PNG' }).click()

    const aviso = page.getByText(/O formato PNG guarda uma imagem só/)
    await expect(aviso).toBeVisible()
    await expect(page.getByText(/6 fotogramas/)).toBeVisible()
    // A sugestao nomeia formatos que resolvem o problema.
    await expect(page.getByText(/Para manter tudo, escolha/)).toContainText(/WebP|GIF/)

    // Voltar a um formato que preserva faz o aviso desaparecer.
    await page.getByRole('radio', { name: 'WebP' }).click()
    await expect(aviso).toHaveCount(0)
    await expect(page.getByText(/preserva a animação/)).toBeVisible()
  })

  test('um GIF estatico nao inventa avisos de animacao', async ({ page }) => {
    await carregar(page, GIF_ESTATICO)
    await expect(page.getByText(/fotograma/)).toHaveCount(0)
    await expect(page.getByText(/animação/)).toHaveCount(0)
  })
})

test.describe('conversao dos formatos novos', () => {
  test('GIF animado para WebP produz um WebP animado descarregavel', async ({ page }) => {
    await carregar(page, GIF_ANIMADO)
    await expect(page.getByRole('radio', { name: 'WebP' })).toBeChecked()

    await page.getByRole('button', { name: /^Converter para WebP/ }).click()
    await expect(page.getByText('Tamanho final')).toBeVisible(ESPERA_LONGA)

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /^Descarregar WebP/ }).click(),
    ])

    expect(download.suggestedFilename()).toBe('gif-animado.webp')
    const bytes = readFileSync(await download.path())
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('RIFF')
    expect(bytes.subarray(8, 12).toString('latin1')).toBe('WEBP')
    // A animacao chegou ao ficheiro que o utilizador recebeu.
    const texto = bytes.toString('latin1')
    expect(texto).toContain('ANIM')
    expect(texto).toContain('ANMF')
  })

  test('um BMP e aceite e converte para WebP muito mais pequeno', async ({ page }) => {
    await carregar(page, BMP)
    await expect(page.getByText('bmp-rgb.bmp')).toBeVisible()

    await page.getByRole('button', { name: /^Converter para WebP/ }).click()
    await expect(page.getByText('Tamanho final')).toBeVisible(ESPERA_LONGA)

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /^Descarregar WebP/ }).click(),
    ])
    expect(download.suggestedFilename()).toBe('bmp-rgb.webp')

    const original = readFileSync(BMP).length
    const resultado = readFileSync(await download.path()).length
    expect(resultado).toBeLessThan(original / 2)
  })

  test('GIF aparece como formato de destino e produz um GIF', async ({ page }) => {
    await carregar(page, resolve(FIXTURES, 'jpeg-normal.jpg'))
    await page.getByRole('radio', { name: 'GIF' }).click()

    // GIF nao tem qualidade com perda: mostrar o controlo seria mostrar algo
    // sem efeito. CLAUDE.md, seccao 11.
    await expect(page.getByLabel(/Qualidade/)).toHaveCount(0)

    await page.getByRole('button', { name: /^Converter para GIF/ }).click()
    await expect(page.getByText('Tamanho final')).toBeVisible(ESPERA_LONGA)

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /^Descarregar GIF/ }).click(),
    ])
    const bytes = readFileSync(await download.path())
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('GIF8')
  })
})
