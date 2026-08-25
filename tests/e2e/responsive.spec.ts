import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

/**
 * Integridade do layout nas larguras do CLAUDE.md, seccao 21.
 *
 * Nao repete a suite inteira em cinco perfis: verifica o que muda com a
 * largura e mais nada. A pergunta e sempre a mesma, "isto continua utilizavel",
 * e as respostas erradas sao concretas: a pagina passa a ter deslocamento
 * horizontal, um controlo sai do ecra, ou um alvo de toque fica pequeno demais.
 *
 * A seccao 21 tambem diz que o telemovel nao e o desktop comprimido. Isso nao
 * se mede automaticamente, mas os tres defeitos acima medem-se, e sao os que
 * aparecem quando alguem trata mobile como uma versao encolhida.
 */

const FIXTURES = resolve(import.meta.dirname, '../fixtures')
const JPG = resolve(FIXTURES, 'jpeg-normal.jpg')

/** As larguras que o CLAUDE.md, seccao 21, manda testar. */
const LARGURAS = [360, 390, 768, 1024, 1280, 1440] as const

/**
 * Altura confortavel para toque, CLAUDE.md seccao 20.9.
 *
 * So se aplica onde o ponteiro e grosseiro. Uma janela de 360 px num portatil
 * com rato nao precisa de alvos de 44 px, e os botoes reduzem para 36 px sob
 * `@media (pointer: fine)` de proposito. Confundir estreito com tatil faria
 * este teste exigir alvos de dedo a quem usa rato.
 */
const ALVO_TATIL = 44

async function ponteiroGrosseiro(page: Page): Promise<boolean> {
  return page.evaluate(() => matchMedia('(pointer: coarse)').matches)
}

async function deslocamentoHorizontal(page: Page): Promise<number> {
  return page.evaluate(() => {
    const doc = document.documentElement
    return doc.scrollWidth - doc.clientWidth
  })
}

/** Elementos cujo conteudo sai da propria caixa na horizontal. */
async function transbordos(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const fora: string[] = []
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const estilo = getComputedStyle(el)
      if (estilo.overflowX !== 'visible') continue
      if (el.scrollWidth > el.clientWidth + 1) {
        fora.push(`${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 40)}`)
      }
    }
    return fora
  })
}

for (const largura of LARGURAS) {
  test.describe(`${largura} px`, () => {
    test('o estado vazio cabe na largura', async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 })
      await page.goto('/')

      await expect(page.getByRole('heading', { name: /Otimize e converta/ })).toBeVisible()
      expect(await deslocamentoHorizontal(page), 'deslocamento horizontal da pagina').toBe(0)
      expect(await transbordos(page), 'elementos a transbordar').toEqual([])

      // O caminho alternativo ao arrastar tem de estar alcancavel.
      // CLAUDE.md, seccao 20.5.
      const seletor = page.getByText('Selecionar ficheiros')
      await expect(seletor).toBeVisible()

      if (await ponteiroGrosseiro(page)) {
        const caixa = await seletor.boundingBox()
        expect(caixa!.height, 'altura do alvo de selecao').toBeGreaterThanOrEqual(ALVO_TATIL)
      }
    })

    test('com um ficheiro carregado nada sai do ecra', async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 })
      await page.goto('/')
      await page.setInputFiles('input[type="file"]', JPG)
      await expect(page.getByRole('button', { name: /^Converter para/ })).toBeEnabled({
        timeout: 120_000,
      })

      expect(await deslocamentoHorizontal(page), 'deslocamento horizontal da pagina').toBe(0)
      expect(await transbordos(page), 'elementos a transbordar').toEqual([])

      // A acao principal tem de estar visivel sem procurar, em qualquer largura.
      const converter = page.getByRole('button', { name: /^Converter para/ })
      await expect(converter).toBeInViewport()

      if (await ponteiroGrosseiro(page)) {
        const caixa = await converter.boundingBox()
        expect(caixa!.height, 'altura do botao principal').toBeGreaterThanOrEqual(ALVO_TATIL)
      }
    })

    test('todos os formatos de destino sao alcancaveis', async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 })
      await page.goto('/')
      await page.setInputFiles('input[type="file"]', JPG)
      await expect(page.getByRole('button', { name: /^Converter para/ })).toBeEnabled({
        timeout: 120_000,
      })

      // Oito formatos ativos. Se um ficar fora do ecra, deixa de existir para
      // o utilizador: foi o que aconteceu ao BMP quando eram seis numa linha.
      const opcoes = page.getByRole('radio')
      const total = await opcoes.count()
      expect(total).toBeGreaterThanOrEqual(8)

      for (let i = 0; i < total; i += 1) {
        const opcao = opcoes.nth(i)
        const caixa = await opcao.boundingBox()
        const nome = (await opcao.getAttribute('value')) ?? String(i)
        expect(caixa, `opcao ${nome} sem caixa`).not.toBeNull()
        expect(caixa!.x, `opcao ${nome} comeca fora do ecra`).toBeGreaterThanOrEqual(0)
        expect(caixa!.x + caixa!.width, `opcao ${nome} acaba fora do ecra`).toBeLessThanOrEqual(
          largura,
        )
      }
    })
  })
}
