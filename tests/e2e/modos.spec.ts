import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

/**
 * Os tres modos do "O que fazer".
 *
 * O terceiro, 'redimensionar', existe porque mudar as dimensoes e uma intencao
 * distinta de reduzir o ficheiro ou de trocar de formato, e porque as duas vias
 * de o fazer (escalar e cortar) tinham ficado em pontas opostas do painel.
 *
 * O que este teste protege, e que nenhum teste unitario pode ver:
 *
 *  - os tres segmentos existem e sao alcancaveis;
 *  - o verbo do botao principal segue o modo, que e o defeito que este projeto
 *    ja teve uma vez quando 'otimizar' passou a ser o defeito;
 *  - no modo de dimensoes o interruptor do redimensionamento NAO aparece, senao
 *    haveria dois controlos com o mesmo nome a dizer a mesma coisa.
 */

const IMAGEM = resolve(import.meta.dirname, '../fixtures/png-rgb.png')

async function carregar(page: Page): Promise<void> {
  await page.goto('/')
  await page.setInputFiles('input[type="file"]', IMAGEM)
  await expect(page.getByRole('img', { name: /Pré-visualização/ })).toBeVisible({
    timeout: 120_000,
  })
  await expect(page.getByRole('radio', { name: 'Redimensionar', exact: true })).toBeEnabled({
    timeout: 120_000,
  })
}

const modo = (page: Page, nome: string) => page.getByRole('radio', { name: nome, exact: true })
const interruptorDeResize = (page: Page) =>
  page.getByRole('checkbox', { name: 'Redimensionar', exact: true })

test.describe('modos', () => {
  test('existem tres, e o de otimizar e o que vem escolhido', async ({ page }) => {
    await carregar(page)
    await expect(modo(page, 'Otimizar')).toBeChecked()
    await expect(modo(page, 'Converter')).toBeVisible()
    await expect(modo(page, 'Redimensionar')).toBeVisible()
  })

  test('o verbo do botao principal segue o modo', async ({ page }) => {
    await carregar(page)
    await expect(page.getByRole('button', { name: /^Otimizar para/ })).toBeVisible()

    await modo(page, 'Redimensionar').check()
    await expect(page.getByRole('button', { name: /^Redimensionar para/ })).toBeVisible()

    await modo(page, 'Converter').check()
    await expect(page.getByRole('button', { name: /^Converter para/ })).toBeVisible()

    // E volta, em vez de ficar preso no ultimo.
    await modo(page, 'Otimizar').check()
    await expect(page.getByRole('button', { name: /^Otimizar para/ })).toBeVisible()
  })

  test('o modo de dimensoes liga o redimensionamento e esconde o interruptor', async ({ page }) => {
    await carregar(page)

    // Em otimizar: interruptor visivel e desligado, campos escondidos.
    await expect(interruptorDeResize(page)).not.toBeChecked()
    await expect(page.getByLabel('Largura', { exact: true })).toHaveCount(0)

    await modo(page, 'Redimensionar').check()

    // O modo E o interruptor: nao pode haver dois controlos com o mesmo nome.
    await expect(interruptorDeResize(page)).toHaveCount(0)
    // E os campos entram pre-enchidos, para serem utilizaveis de imediato.
    await expect(page.getByLabel('Largura', { exact: true }).first()).toHaveValue('1200')
    await expect(page.getByLabel('Altura', { exact: true }).first()).toHaveValue('800')
  })

  test('o corte pertence ao mesmo modo, logo abaixo das dimensoes', async ({ page }) => {
    await carregar(page)
    await modo(page, 'Redimensionar').check()
    await expect(page.getByRole('checkbox', { name: 'Cortar', exact: true })).toBeVisible()
  })

  test('sair do modo nao desliga o redimensionamento escolhido', async ({ page }) => {
    await carregar(page)
    await modo(page, 'Redimensionar').check()
    await page.getByLabel('Largura', { exact: true }).first().fill('600')

    await modo(page, 'Otimizar').check()
    // O interruptor volta, ligado, com o valor que o utilizador escolheu.
    await expect(interruptorDeResize(page)).toBeChecked()
    await expect(page.getByLabel('Largura', { exact: true }).first()).toHaveValue('600')
  })

  test('o modo de dimensoes nao deixa escolher formato de destino', async ({ page }) => {
    await carregar(page)
    await modo(page, 'Redimensionar').check()
    // Mantem o formato de origem, como otimizar: nao ha seletor de formato.
    await expect(page.getByRole('radio', { name: 'WebP', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Redimensionar para PNG/ })).toBeVisible()
  })

  test('redimensionar produz o ficheiro com as dimensoes pedidas', async ({ page }) => {
    await carregar(page)
    await modo(page, 'Redimensionar').check()
    await page.getByLabel('Largura', { exact: true }).first().fill('600')

    await page.getByRole('button', { name: /^Redimensionar para/ }).click()
    await expect(page.getByText('Tamanho final')).toBeVisible({ timeout: 120_000 })
    await expect(page.getByText('1200 x 800').first()).toBeVisible()

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /^Descarregar / }).first().click(),
    ])
    const { readFileSync } = await import('node:fs')
    const bytes = readFileSync(await download.path())
    // IHDR: 600 de largura e 400 de altura, com a proporcao preservada.
    expect(bytes.readUInt32BE(16)).toBe(600)
    expect(bytes.readUInt32BE(20)).toBe(400)
  })
})
