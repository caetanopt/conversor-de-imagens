import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

/**
 * TIFF e ICO no browser.
 *
 * O motor esta coberto por tests/unit/tiff-ico.test.ts. Aqui verifica-se o que
 * so o browser mostra: um TIFF tem pre-visualizacao apesar de o browser nao
 * saber descodifica-lo, e um ICO avisa que vai reduzir a imagem antes de o
 * fazer.
 */

const FIXTURES = resolve(import.meta.dirname, '../fixtures')
const ESPERA_LONGA = { timeout: 120_000 }

async function carregar(page: Page, ficheiro: string): Promise<void> {
  await page.goto('/')
  await page.setInputFiles('input[type="file"]', resolve(FIXTURES, ficheiro))
  await expect(page.getByRole('button', { name: /^Converter para/ })).toBeEnabled(ESPERA_LONGA)
}

test.describe('TIFF', () => {
  test('tem pre-visualizacao, produzida pelo motor', async ({ page }) => {
    await carregar(page, 'tiff-normal.tif')

    // O browser nao descodifica TIFF: se a miniatura aparece, veio do motor.
    await expect(page.getByRole('img', { name: /Pré-visualização/ })).toBeVisible(ESPERA_LONGA)
    await expect(page.getByText('1200 x 800')).toBeVisible()
  })

  test('converte para WebP e o resultado e muito mais pequeno', async ({ page }) => {
    await carregar(page, 'tiff-normal.tif')
    await page.getByRole('button', { name: /^Converter para WebP/ }).click()
    await expect(page.getByText('Tamanho final')).toBeVisible(ESPERA_LONGA)

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /^Descarregar WebP/ }).click(),
    ])
    expect(download.suggestedFilename()).toBe('tiff-normal.webp')

    const original = readFileSync(resolve(FIXTURES, 'tiff-normal.tif')).length
    const resultado = readFileSync(await download.path()).length
    expect(resultado).toBeLessThan(original / 10)
  })

  test('um TIFF de varias paginas avisa antes de reduzir a primeira', async ({ page }) => {
    await carregar(page, 'tiff-multipagina.tiff')

    // O destino sugerido e WebP, que nao guarda paginas.
    await expect(page.getByText(/3 páginas/)).toBeVisible()
    await expect(page.getByText(/fica apenas a primeira/)).toBeVisible()

    // Em TIFF as paginas mantem-se, e o aviso muda.
    await page.getByRole('radio', { name: 'TIFF' }).click()
    await expect(page.getByText(/Todas são mantidas/)).toBeVisible()
  })
})

test.describe('ICO', () => {
  test('um ICO de varios tamanhos mostra o maior', async ({ page }) => {
    await carregar(page, 'ico-multi.ico')
    // O ficheiro tem 16, 48 e 256 px. Mostrar 16 seria enganador.
    await expect(page.getByText('256 x 256')).toBeVisible(ESPERA_LONGA)
    await expect(page.getByText(/3 tamanhos/)).toBeVisible()
  })

  test('avisa que vai reduzir para 256 antes de converter', async ({ page }) => {
    await carregar(page, 'jpeg-normal.jpg')
    await page.getByRole('radio', { name: 'ICO' }).click()

    const aviso = page.getByText(/não passa de 256 píxeis/)
    await expect(aviso).toBeVisible()
    await expect(page.getByText(/reduzida para 256 x 171/)).toBeVisible()

    // Voltar a um formato sem limite faz o aviso desaparecer.
    await page.getByRole('radio', { name: 'WebP' }).click()
    await expect(aviso).toHaveCount(0)
  })

  test('produz um ICO que declara as dimensoes certas', async ({ page }) => {
    await carregar(page, 'jpeg-normal.jpg')
    await page.getByRole('radio', { name: 'ICO' }).click()
    await page.getByRole('button', { name: /^Converter para ICO/ }).click()
    await expect(page.getByText('Tamanho final')).toBeVisible(ESPERA_LONGA)

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /^Descarregar ICO/ }).click(),
    ])
    expect(download.suggestedFilename()).toBe('jpeg-normal.ico')

    const bytes = readFileSync(await download.path())
    // ICONDIR: reservado 0, tipo 1, uma imagem.
    expect(bytes.readUInt16LE(0)).toBe(0)
    expect(bytes.readUInt16LE(2)).toBe(1)
    // A largura declarada: 0 significa 256 na norma, e a imagem tem 256.
    expect(bytes[6]).toBe(0)
  })
})
