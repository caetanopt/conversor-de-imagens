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
  // Este ficheiro testa a mecanica de escolha de formato, que so existe em
  // modo 'converter' — FormatSelect nem chega a ser desenhado em 'otimizar'.
  // O modo por defeito da aplicacao e 'otimizar', por isso o pedido e
  // explicito em vez de assumido. O texto do botao principal segue o modo,
  // por isso a troca acontece antes de esperar por "Converter para X".
  const modoConverter = page.getByRole('radio', { name: 'Converter' })
  await expect(modoConverter).toBeEnabled(ESPERA_LONGA)
  await modoConverter.check()
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
    // O modo 'otimizar' por defeito mantem GIF; este teste e especificamente
    // sobre converter para WebP, por isso escolhe-o de forma explicita.
    await page.getByRole('radio', { name: 'WebP' }).click()

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
    // O modo 'otimizar' por defeito mantem BMP; este teste e especificamente
    // sobre converter para WebP, por isso escolhe-o de forma explicita.
    await page.getByRole('radio', { name: 'WebP' }).click()

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

test.describe('sem perda', () => {
  test('o controlo aparece em WebP, produz um ficheiro maior, e desaparece em PNG', async ({
    page,
  }) => {
    await carregar(page, resolve(FIXTURES, 'jpeg-normal.jpg'))

    // O modo 'otimizar' por defeito mantem JPG; este teste precisa de WebP,
    // que tem os dois modos, sem nem com perda.
    await page.getByRole('radio', { name: 'WebP' }).click()
    const semPerda = page.getByRole('checkbox', { name: 'Sem perda' })
    await expect(semPerda).toBeVisible()
    await expect(semPerda).not.toBeChecked()

    // Com perda, para ter a referencia.
    await page.getByRole('button', { name: /^Converter para WebP/ }).click()
    await expect(page.getByText('Tamanho final')).toBeVisible(ESPERA_LONGA)
    const [comPerda] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /^Descarregar WebP/ }).click(),
    ])
    const bytesComPerda = readFileSync(await comPerda.path()).length

    // Ligar sem perda invalida o resultado e esconde a qualidade, que passa a
    // estar imposta.
    await semPerda.check()
    await expect(page.getByLabel('Qualidade')).toHaveCount(0)
    await expect(page.getByText('Tamanho final')).toHaveCount(0)

    await page.getByRole('button', { name: /^Converter para WebP/ }).click()
    await expect(page.getByText('Tamanho final')).toBeVisible(ESPERA_LONGA)
    const [semPerdaFicheiro] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /^Descarregar WebP/ }).click(),
    ])
    const bytesSemPerda = readFileSync(await semPerdaFicheiro.path()).length

    // Medido: 78 KB contra 1 065 KB na mesma imagem. A margem do teste e ampla
    // de proposito, porque o que importa e a ordem de grandeza.
    expect(bytesSemPerda).toBeGreaterThan(bytesComPerda * 3)

    // Num PNG a opcao nao existe: o formato ja e sem perda.
    await page.getByRole('radio', { name: 'PNG' }).click()
    await expect(page.getByRole('checkbox', { name: 'Sem perda' })).toHaveCount(0)
  })

  test('o deslizador de qualidade nao chega a 100 onde 100 nao serve', async ({ page }) => {
    await carregar(page, resolve(FIXTURES, 'jpeg-normal.jpg'))

    // JPEG vai ate 100.
    await page.getByRole('radio', { name: 'JPG' }).click()
    await expect(page.getByRole('slider', { name: /Qualidade/ })).toHaveAttribute('max', '100')

    // AVIF para em 99, porque 100 lanca erro do encoder.
    await page.getByRole('radio', { name: 'AVIF' }).click()
    await expect(page.getByRole('slider', { name: /Qualidade/ })).toHaveAttribute('max', '99')

    // WebP para em 99, porque 100 e o modo sem perda e esse tem controlo proprio.
    await page.getByRole('radio', { name: 'WebP' }).click()
    await expect(page.getByRole('slider', { name: /Qualidade/ })).toHaveAttribute('max', '99')
  })

  test('AVIF no topo da qualidade continua a converter', async ({ page }) => {
    await carregar(page, resolve(FIXTURES, 'jpeg-normal.jpg'))
    await page.getByRole('radio', { name: 'AVIF' }).click()

    const slider = page.getByRole('slider', { name: /Qualidade/ })
    await slider.fill('99')
    await page.getByRole('button', { name: /^Converter para AVIF/ }).click()

    // Antes do teto por formato, arrastar ate ao fim dava erro do encoder.
    await expect(page.getByText('Tamanho final')).toBeVisible(ESPERA_LONGA)

    // A ausencia de erro verifica-se no estado do ficheiro, e nao por
    // `getByRole('alert')`: sem escopo, isso tambem apanha a regiao viva.
    const linha = page.getByRole('listitem').filter({ hasText: 'jpeg-normal.jpg' })
    await expect(linha).toContainText('Concluído')
    await expect(linha).not.toContainText('Erro')
  })
})
