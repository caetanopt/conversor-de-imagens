import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

/**
 * Ferramenta de corte, no browser real.
 *
 * Os testes unitarios cobrem a geometria e o motor. Este cobre o que so um
 * browser prova: que o gesto do rato chega ao retangulo com a escala certa,
 * que o teclado funciona, e que as dimensoes escolhidas sao as do ficheiro
 * descarregado.
 *
 * A escala e o ponto delicado: a pre-visualizacao e uma miniatura e o corte e
 * guardado em pixeis da imagem de origem. Um arrasto de 200 px de ecra numa
 * area de 720 px que mostra uma imagem de 1200 px tem de valer 333 px de
 * imagem, e nao 200.
 */

const FIXTURES = resolve(import.meta.dirname, '../fixtures')
/** 1200x800, e as contas de escala deste teste dependem disso. */
const IMAGEM = resolve(FIXTURES, 'png-rgb.png')

async function carregarComCorte(page: Page): Promise<void> {
  await page.goto('/')
  await page.setInputFiles('input[type="file"]', IMAGEM)
  await expect(page.getByRole('img', { name: /Pré-visualização/ })).toBeVisible({
    timeout: 120_000,
  })
  const cortar = page.getByRole('checkbox', { name: /^Cortar/ })
  await expect(cortar).toBeEnabled({ timeout: 120_000 })
  await cortar.check()
}

const largura = (page: Page) => page.getByLabel('Largura', { exact: true }).first()
const altura = (page: Page) => page.getByLabel('Altura', { exact: true }).first()

test.describe('corte', () => {
  test('comeca com a imagem inteira e o painel diz o que vai sair', async ({ page }) => {
    await carregarComCorte(page)
    await expect(largura(page)).toHaveValue('1200')
    await expect(altura(page)).toHaveValue('800')
    await expect(page.getByText('1200 x 800 para 1200 x 800')).toBeVisible()
  })

  test('arrastar um manipulo converte pixeis de ecra em pixeis de imagem', async ({ page }) => {
    await carregarComCorte(page)

    const manipulo = page.getByRole('button', { name: /canto inferior direito/ })

    /*
     * Trazer o manipulo para dentro do viewport ANTES de ler as coordenadas.
     *
     * `page.mouse` trabalha em coordenadas de viewport e nao faz scroll por si.
     * Num viewport de 720 px de altura o manipulo inferior fica abaixo da dobra,
     * e o arrasto acertava em espaco vazio: a primeira versao deste teste media
     * 1200 antes e 1200 depois. `hover()` faz o scroll que o rato cru nao faz.
     */
    await manipulo.hover()

    const area = page.getByTestId('corte-area')
    const caixaDaArea = await area.boundingBox()
    expect(caixaDaArea).not.toBeNull()

    const caixa = await manipulo.boundingBox()
    expect(caixa).not.toBeNull()

    const centroX = caixa!.x + caixa!.width / 2
    const centroY = caixa!.y + caixa!.height / 2
    const arrastoEcra = 200

    await page.mouse.move(centroX, centroY)
    await page.mouse.down()
    await page.mouse.move(centroX - arrastoEcra, centroY, { steps: 10 })
    await page.mouse.up()

    // A largura tem de descer pelo arrasto CONVERTIDO para pixeis de imagem.
    const escala = 1200 / caixaDaArea!.width
    const esperada = Math.round(1200 - arrastoEcra * escala)
    const obtida = Number(await largura(page).inputValue())

    // Margem de 3 px: o rato anda em passos e o retangulo e arredondado.
    expect(Math.abs(obtida - esperada), `esperava ~${esperada}, obtive ${obtida}`).toBeLessThan(4)
    // E nao o valor ingenuo, que seria o arrasto em pixeis de ecra.
    expect(obtida).not.toBe(1200 - arrastoEcra)
  })

  test('a proporcao reenquadra logo e mantem-se', async ({ page }) => {
    await carregarComCorte(page)

    await page.getByLabel('Proporção').selectOption('1:1')
    // O maior quadrado que cabe num 1200x800.
    await expect(largura(page)).toHaveValue('800')
    await expect(altura(page)).toHaveValue('800')

    await page.getByLabel('Proporção').selectOption('16:9')
    await expect(largura(page)).toHaveValue('1200')
    await expect(altura(page)).toHaveValue('675')

    // Escrever uma largura com a proporcao travada recalcula a altura.
    await largura(page).fill('800')
    await expect(altura(page)).toHaveValue('450')
  })

  test('as setas ajustam o corte, para quem nao pode arrastar', async ({ page }) => {
    /*
     * Arrastar nao pode ser a unica via. CLAUDE.md, seccao 20.1.
     *
     * Defeito real apanhado aqui: os manipulos vivem dentro da janela, que
     * tambem escuta as setas para se mover, e a chamada de mover sobrepunha a
     * de redimensionar. O teclado nao fazia nada, e o teste unitario da
     * geometria nao podia ver isso porque o problema estava na propagacao.
     */
    await carregarComCorte(page)

    const manipulo = page.getByRole('button', { name: /canto inferior direito/ })
    await manipulo.focus()

    await page.keyboard.press('ArrowLeft')
    await expect(largura(page)).toHaveValue('1199')

    // Shift salta dez de cada vez.
    await page.keyboard.down('Shift')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.up('Shift')
    await expect(largura(page)).toHaveValue('1189')
  })

  test('trocar largura por altura', async ({ page }) => {
    await carregarComCorte(page)
    await largura(page).fill('640')
    await altura(page).fill('480')

    await page.getByRole('button', { name: /Trocar largura por altura/ }).click()
    await expect(largura(page)).toHaveValue('480')
    await expect(altura(page)).toHaveValue('640')
  })

  test('repor devolve a imagem inteira', async ({ page }) => {
    await carregarComCorte(page)
    await largura(page).fill('300')
    await expect(largura(page)).toHaveValue('300')

    await page.getByRole('button', { name: /^Repor$/ }).click()
    await expect(largura(page)).toHaveValue('1200')
    await expect(altura(page)).toHaveValue('800')
  })

  test('o ficheiro descarregado tem as dimensoes escolhidas', async ({ page }) => {
    await carregarComCorte(page)
    await largura(page).fill('640')
    await altura(page).fill('480')

    await page.getByRole('button', { name: /^Otimizar/ }).click()
    await expect(page.getByText('Tamanho final')).toBeVisible({ timeout: 120_000 })
    await expect(page.getByText('1200 x 800').first()).toBeVisible()

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /^Descarregar / }).first().click(),
    ])
    const bytes = readFileSync(await download.path())

    // O IHDR de um PNG guarda largura e altura nos bytes 16 a 23. E a unica
    // prova que conta: o que a interface diz pode estar certo e o ficheiro errado.
    expect(bytes.readUInt32BE(16)).toBe(640)
    expect(bytes.readUInt32BE(20)).toBe(480)
  })

  test('desligar o corte faz desaparecer a sobreposicao', async ({ page }) => {
    await carregarComCorte(page)
    await expect(page.getByTestId('corte-area')).toBeVisible()

    await page.getByRole('checkbox', { name: /^Cortar/ }).uncheck()
    await expect(page.getByTestId('corte-area')).toHaveCount(0)
    await expect(page.getByText('A imagem é convertida por inteiro.')).toBeVisible()
  })
})
