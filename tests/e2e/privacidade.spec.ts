import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test, type Page, type Request } from '@playwright/test'

/**
 * Teste obrigatorio de privacidade.
 *
 * Automatiza o procedimento manual da seccao 29 do CLAUDE.md. Corre o fluxo
 * completo, selecionar, converter, descarregar, enquanto grava todos os
 * pedidos de rede, e falha se algum levar bytes para fora do dispositivo.
 *
 * Sem isto, o requisito de processamento local depende de alguem se lembrar de
 * abrir o painel de rede. Aqui e o build que se lembra.
 */

const FIXTURES = resolve(import.meta.dirname, '../fixtures')
const AMOSTRA_JPG = resolve(FIXTURES, 'amostra-1200x800.jpg')
const NAO_IMAGEM = resolve(FIXTURES, 'nao-e-imagem.jpg')

type PedidoGravado = {
  readonly url: string
  readonly metodo: string
  readonly bytesEnviados: number
  readonly contentType: string
}

function gravarPedidos(pagina: Page): PedidoGravado[] {
  const pedidos: PedidoGravado[] = []
  pagina.on('request', (pedido: Request) => {
    const corpo = pedido.postData()
    pedidos.push({
      url: pedido.url(),
      metodo: pedido.method(),
      bytesEnviados: corpo ? Buffer.byteLength(corpo) : 0,
      contentType: pedido.headers()['content-type'] ?? '',
    })
  })
  return pedidos
}

test.describe('processamento local', () => {
  test('converte JPG para WebP sem enviar bytes para nenhum servidor', async ({ page }) => {
    const pedidos = gravarPedidos(page)
    await page.goto('/')

    // 1. Selecionar
    await page.setInputFiles('input[type="file"]', AMOSTRA_JPG)
    await expect(page.getByText('amostra-1200x800.jpg')).toBeVisible()

    // 2. Visualizar. A miniatura e gerada localmente, so aparece depois de o
    //    motor devolver as dimensoes.
    await expect(page.getByRole('img', { name: /Pré-visualização/ })).toBeVisible({
      timeout: 120_000,
    })
    await expect(page.getByText('1200 x 800')).toBeVisible()

    // 3. Escolher formato. WebP e o destino sugerido para um JPG.
    await expect(page.getByRole('radio', { name: 'WebP' })).toBeChecked()

    // 4. Converter
    const botaoConverter = page.getByRole('button', { name: /Converter para WebP/ })
    await expect(botaoConverter).toBeEnabled({ timeout: 120_000 })
    await botaoConverter.click()

    // 5. Comparar
    await expect(page.getByText('Tamanho final')).toBeVisible({ timeout: 120_000 })
    await expect(page.getByText(/Processado no seu dispositivo em/)).toBeVisible()

    // 6. Descarregar
    const descarregar = page.getByRole('button', { name: /Descarregar/ })
    await expect(descarregar).toBeVisible()
    const [download] = await Promise.all([page.waitForEvent('download'), descarregar.click()])

    expect(download.suggestedFilename()).toBe('amostra-1200x800.webp')
    const caminho = await download.path()
    const resultado = readFileSync(caminho)

    // O ficheiro descarregado e realmente um WebP: RIFF....WEBP
    expect(resultado.subarray(0, 4).toString('latin1')).toBe('RIFF')
    expect(resultado.subarray(8, 12).toString('latin1')).toBe('WEBP')
    expect(resultado.byteLength).toBeGreaterThan(0)

    // ------------------------------------------------------------------
    // A verificacao que da nome a este teste.
    // ------------------------------------------------------------------

    const comCorpo = pedidos.filter((p) => p.bytesEnviados > 0)
    expect(comCorpo, `pedidos com corpo: ${JSON.stringify(comCorpo, null, 2)}`).toHaveLength(0)

    const naoGet = pedidos.filter((p) => p.metodo !== 'GET')
    expect(naoGet, `pedidos que nao sao GET: ${JSON.stringify(naoGet, null, 2)}`).toHaveLength(0)

    const multipart = pedidos.filter((p) => p.contentType.includes('multipart'))
    expect(multipart).toHaveLength(0)

    // Separar pedidos de rede de esquemas locais. Um blob: ou data: nunca sai
    // do dispositivo por construcao, e a miniatura usa um blob:.
    const deRede = pedidos.filter((p) => p.url.startsWith('http:') || p.url.startsWith('https:'))
    const locais = pedidos.filter((p) => !deRede.includes(p))

    // Nenhum pedido de rede para fora da nossa origem. Nem CDN, nem analytics,
    // nem tipos de letra, nem nada.
    const foraDaOrigem = deRede.filter((p) => !p.url.startsWith('http://127.0.0.1:4321'))
    expect(
      foraDaOrigem,
      `pedidos para outra origem: ${JSON.stringify(foraDaOrigem, null, 2)}`,
    ).toHaveLength(0)

    // Os esquemas locais tem de ser mesmo locais, e o blob tem de pertencer a
    // nossa origem. Um blob de outra origem seria conteudo de terceiros.
    for (const pedido of locais) {
      expect(pedido.url, `esquema inesperado: ${pedido.url}`).toMatch(
        /^(blob:http:\/\/127\.0\.0\.1:4321\/|data:)/,
      )
    }

    // O total de bytes enviados no corpo de pedidos e exatamente zero.
    expect(pedidos.reduce((total, p) => total + p.bytesEnviados, 0)).toBe(0)

    // Contraprova: a pagina fez pedidos de facto, incluindo o binario do motor.
    // Sem isto o teste passaria numa pagina que nao carregou nada.
    expect(pedidos.length).toBeGreaterThan(3)
    expect(pedidos.some((p) => p.url.includes('magick.wasm'))).toBe(true)
  })

  test('nao guarda nada no dispositivo', async ({ page }) => {
    await page.goto('/')
    await page.setInputFiles('input[type="file"]', AMOSTRA_JPG)

    const botao = page.getByRole('button', { name: /Converter para WebP/ })
    await expect(botao).toBeEnabled({ timeout: 120_000 })
    await botao.click()
    await expect(page.getByText('Tamanho final')).toBeVisible({ timeout: 120_000 })

    const armazenamento = await page.evaluate(async () => ({
      localStorage: Object.keys(localStorage).length,
      sessionStorage: Object.keys(sessionStorage).length,
      // indexedDB.databases nao existe em todos os browsers; -1 marca "nao verificavel".
      indexedDB: typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).length : -1,
      caches: typeof caches !== 'undefined' ? (await caches.keys()).length : -1,
      serviceWorkers: navigator.serviceWorker
        ? (await navigator.serviceWorker.getRegistrations()).length
        : -1,
    }))

    expect(armazenamento.localStorage).toBe(0)
    expect(armazenamento.sessionStorage).toBe(0)
    expect(armazenamento.indexedDB).toBeLessThanOrEqual(0)
    expect(armazenamento.caches).toBeLessThanOrEqual(0)
    expect(armazenamento.serviceWorkers).toBeLessThanOrEqual(0)
  })
})

test.describe('estados da interface', () => {
  test('rejeita um ficheiro que nao e imagem, apesar da extensao', async ({ page }) => {
    await page.goto('/')
    await page.setInputFiles('input[type="file"]', NAO_IMAGEM)

    // O anunciador de rota do Next tambem tem role=alert, por isso limitamos a
    // procura a coluna do ficheiro.
    const painelDoFicheiro = page.getByRole('complementary', { name: 'Ficheiro' })
    await expect(painelDoFicheiro.getByRole('alert')).toContainText(/não parece ser uma imagem/i)
    // Nao pode existir accao de conversao sobre um ficheiro rejeitado.
    await expect(page.getByRole('button', { name: /^Converter para/ })).toBeDisabled()
  })

  test('mudar o formato de destino invalida o resultado anterior', async ({ page }) => {
    await page.goto('/')
    await page.setInputFiles('input[type="file"]', AMOSTRA_JPG)

    const converter = page.getByRole('button', { name: /Converter para WebP/ })
    await expect(converter).toBeEnabled({ timeout: 120_000 })
    await converter.click()
    await expect(page.getByRole('button', { name: /Descarregar/ })).toBeVisible({
      timeout: 120_000,
    })

    // Trocar para PNG tem de tirar o botao de descarregar, senao o utilizador
    // descarregava um WebP a pensar que era um PNG.
    await page.getByRole('radio', { name: 'PNG' }).check()
    await expect(page.getByRole('button', { name: /Descarregar/ })).toBeHidden()
    await expect(page.getByRole('button', { name: /Converter para PNG/ })).toBeVisible()
  })

  test('PNG nao mostra controlo de qualidade, porque nao tem efeito', async ({ page }) => {
    await page.goto('/')
    await page.setInputFiles('input[type="file"]', AMOSTRA_JPG)
    await expect(page.getByRole('img', { name: /Pré-visualização/ })).toBeVisible({
      timeout: 120_000,
    })

    await expect(page.getByRole('slider', { name: /Qualidade/ })).toBeVisible()
    await page.getByRole('radio', { name: 'PNG' }).check()
    await expect(page.getByRole('slider', { name: /Qualidade/ })).toBeHidden()
    await expect(page.getByText(/formato sem perda/)).toBeVisible()
  })
})
