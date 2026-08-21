import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test, type Locator, type Page, type Request } from '@playwright/test'
import { unzipSync } from 'fflate'

/**
 * Conversao em lote e ZIP local.
 *
 * O que estes testes protegem, por ordem de importancia:
 *
 *  1. o ZIP e criado no dispositivo e nenhum byte sai pela rede;
 *  2. um lote com falhas nunca se apresenta como concluido;
 *  3. as definicoes de um ficheiro podem ser empurradas para os restantes;
 *  4. cancelar interrompe o que falta sem apagar o que ja foi feito.
 */

const FIXTURES = resolve(import.meta.dirname, '../fixtures')
const ORIGEM = 'http://127.0.0.1:4321'

const JPG = resolve(FIXTURES, 'jpeg-normal.jpg')
const PNG = resolve(FIXTURES, 'png-rgb.png')
const PNG_ALFA = resolve(FIXTURES, 'png-transparencia.png')
const PNG_GRANDE = resolve(FIXTURES, 'png-grande.png')
const WEBP = resolve(FIXTURES, 'webp-normal.webp')
const NAO_E_IMAGEM = resolve(FIXTURES, 'nao-e-imagem.jpg')

const ESPERA_LONGA = { timeout: 120_000 }

function linhaDaFila(page: Page, nome: string): Locator {
  return page.getByRole('listitem').filter({ hasText: nome })
}

/** O nome do ficheiro esta no inicio do nome acessivel do botao de selecao. */
function botaoDeSelecao(page: Page, nome: string): Locator {
  const escapado = nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return linhaDaFila(page, nome).getByRole('button', { name: new RegExp(`^${escapado}`) })
}

async function carregar(page: Page, ficheiros: readonly string[]): Promise<void> {
  await page.goto('/')
  await page.setInputFiles('input[type="file"]', [...ficheiros])
}

/** Espera que a analise inicial acabe: ate ai o botao de converter esta preso. */
async function esperarProntoParaConverter(page: Page): Promise<Locator> {
  const botao = page.getByRole('button', { name: /^(Converter|Nada para converter)/ })
  await expect(botao).toBeVisible(ESPERA_LONGA)
  await expect(botao).toBeEnabled(ESPERA_LONGA)
  return botao
}

test.describe('lote', () => {
  test('converte tres imagens e o ZIP e criado no dispositivo', async ({ page }) => {
    const pedidos: { url: string; metodo: string; bytes: number; contentType: string }[] = []
    page.on('request', (pedido: Request) => {
      const corpo = pedido.postData()
      pedidos.push({
        url: pedido.url(),
        metodo: pedido.method(),
        bytes: corpo ? Buffer.byteLength(corpo) : 0,
        contentType: pedido.headers()['content-type'] ?? '',
      })
    })

    await carregar(page, [JPG, PNG, PNG_ALFA])

    // A fila mostra os tres, e cada um tem estado proprio.
    await expect(page.getByRole('listitem')).toHaveCount(3)
    await expect(page.getByRole('heading', { name: '3 ficheiros' })).toBeVisible()

    const converter = await esperarProntoParaConverter(page)
    await expect(converter).toHaveText('Converter 3 imagens')
    await converter.click()

    await expect(page.getByText('3 de 3 concluídas')).toBeVisible(ESPERA_LONGA)

    // ------------------------------------------------------------------
    // O ZIP
    // ------------------------------------------------------------------
    const descarregar = page.getByRole('button', { name: /Descarregar 3 em ZIP/ })
    await expect(descarregar).toBeVisible()
    const [download] = await Promise.all([page.waitForEvent('download'), descarregar.click()])

    expect(download.suggestedFilename()).toBe('3-imagens-convertidas.zip')

    const conteudo = unzipSync(readFileSync(await download.path()))
    expect(Object.keys(conteudo).sort()).toEqual([
      'jpeg-normal.webp',
      'png-rgb.webp',
      'png-transparencia.webp',
    ])

    // Cada entrada e um WebP de verdade, nao um ficheiro vazio com o nome certo.
    for (const [nome, bytes] of Object.entries(conteudo)) {
      const cabecalho = Buffer.from(bytes.subarray(0, 12))
      expect(cabecalho.subarray(0, 4).toString('latin1'), nome).toBe('RIFF')
      expect(cabecalho.subarray(8, 12).toString('latin1'), nome).toBe('WEBP')
    }

    // ------------------------------------------------------------------
    // Privacidade: o lote nao abre uma porta nova
    // ------------------------------------------------------------------
    expect(pedidos.filter((p) => p.bytes > 0).map((p) => p.url)).toHaveLength(0)
    expect(pedidos.filter((p) => p.metodo !== 'GET').map((p) => p.url)).toHaveLength(0)
    expect(pedidos.filter((p) => p.contentType.includes('multipart'))).toHaveLength(0)

    const deRede = pedidos.filter((p) => /^https?:/.test(p.url))
    expect(deRede.filter((p) => !p.url.startsWith(ORIGEM)).map((p) => p.url)).toHaveLength(0)
    // Contraprova: a pagina fez pedidos, incluindo o binario do motor.
    expect(pedidos.some((p) => p.url.includes('magick.wasm'))).toBe(true)
  })

  test('aplicar a todos empurra as definicoes do ficheiro selecionado', async ({ page }) => {
    // Estes dois tem destinos sugeridos diferentes por defeito: JPG vai para
    // WebP e WebP vai para JPG. Se "aplicar a todos" nao funcionar, o ZIP sai
    // com extensoes diferentes.
    await carregar(page, [JPG, WEBP])
    await esperarProntoParaConverter(page)

    await botaoDeSelecao(page, 'jpeg-normal.jpg').click()
    await page.getByRole('radio', { name: 'AVIF' }).click()
    await page.getByRole('button', { name: 'Aplicar a todos os ficheiros' }).click()

    // O segundo ficheiro passou a AVIF sem o utilizador o ter selecionado.
    await botaoDeSelecao(page, 'webp-normal.webp').click()
    await expect(page.getByRole('radio', { name: 'AVIF' })).toBeChecked()

    const converter = await esperarProntoParaConverter(page)
    await converter.click()
    await expect(page.getByText('2 de 2 concluídas')).toBeVisible(ESPERA_LONGA)

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Descarregar 2 em ZIP/ }).click(),
    ])

    const conteudo = unzipSync(readFileSync(await download.path()))
    expect(Object.keys(conteudo).sort()).toEqual(['jpeg-normal.avif', 'webp-normal.avif'])

    // 'ftyp' seguido da marca 'avif' na caixa inicial.
    for (const [nome, bytes] of Object.entries(conteudo)) {
      const inicio = Buffer.from(bytes.subarray(0, 16)).toString('latin1')
      expect(inicio.includes('ftyp'), nome).toBe(true)
      expect(inicio.includes('avif'), nome).toBe(true)
    }
  })

  test('um lote parcialmente concluido nao se apresenta como concluido', async ({ page }) => {
    await carregar(page, [JPG, NAO_E_IMAGEM])

    // O ficheiro recusado fica na fila, com o erro visivel.
    await expect(page.getByRole('listitem')).toHaveCount(2)
    await expect(linhaDaFila(page, 'nao-e-imagem.jpg')).toContainText('Erro')

    const converter = await esperarProntoParaConverter(page)
    // Um so e convertivel: o outro nao passou a validacao.
    await expect(converter).toHaveText('Converter 1 imagem')
    await converter.click()

    const estado = page.getByText(/1 de 2 concluídas/)
    await expect(estado).toBeVisible(ESPERA_LONGA)
    await expect(estado).toContainText('1 com erro')
    // A afirmacao que nao pode acontecer.
    await expect(page.getByText('2 de 2 concluídas')).toHaveCount(0)

    // O que concluiu continua descarregavel.
    await expect(page.getByRole('button', { name: /Descarregar 1 em ZIP/ })).toBeVisible()
  })

  test('cancelar tudo interrompe o lote e a fila diz que foi cancelado', async ({ page }) => {
    // A imagem de 6 MP leva segundos, o que da uma janela real para cancelar.
    await carregar(page, [PNG_GRANDE, JPG])
    const converter = await esperarProntoParaConverter(page)
    await converter.click()

    const cancelar = page.getByRole('button', { name: 'Cancelar tudo' })
    await expect(cancelar).toBeVisible(ESPERA_LONGA)
    await cancelar.click()

    // A imagem grande estava a meio: tem de ficar marcada como cancelada, e
    // nao como erro. Cancelar nao e falhar.
    await expect(linhaDaFila(page, 'png-grande.png')).toContainText('Cancelado', ESPERA_LONGA)
    await expect(linhaDaFila(page, 'png-grande.png')).not.toContainText('Erro')

    // O resumo do lote conta o cancelamento em vez de dizer que concluiu.
    // A verificacao e no rodape e nao na pagina toda, porque a regiao aria-live
    // tambem anuncia o cancelamento e as duas fontes confundiam-se.
    const rodape = page.locator('footer')
    await expect(rodape).toContainText(/cancelada/, ESPERA_LONGA)
    await expect(rodape).not.toContainText('concluídas')

    // Cancelar nao e um erro: o ficheiro volta a poder ser convertido.
    await expect(page.getByRole('button', { name: /^Converter \d/ })).toBeEnabled(ESPERA_LONGA)
  })

  test('remover tudo limpa a fila e devolve a zona de entrada', async ({ page }) => {
    await carregar(page, [JPG, PNG])
    await expect(page.getByRole('listitem')).toHaveCount(2)

    await page.getByRole('button', { name: 'Remover tudo' }).click()

    await expect(page.getByRole('listitem')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: /Otimize e converta imagens/ })).toBeVisible()
  })

  test('remover um ficheiro passa a selecao para outro', async ({ page }) => {
    await carregar(page, [JPG, PNG])
    await esperarProntoParaConverter(page)

    await botaoDeSelecao(page, 'jpeg-normal.jpg').click()
    await expect(botaoDeSelecao(page, 'jpeg-normal.jpg')).toHaveAttribute('aria-pressed', 'true')

    await page.getByRole('button', { name: 'Remover jpeg-normal.jpg' }).click()

    await expect(page.getByRole('listitem')).toHaveCount(1)
    // Com um unico ficheiro a selecao deixa de existir, e o painel mostra esse.
    await expect(page.getByRole('heading', { name: '1 ficheiro' })).toBeVisible()
    await expect(page.getByText('png-rgb.png')).toBeVisible()
  })

  test('respeita o limite de ficheiros em vez de aceitar tudo', async ({ page }) => {
    await page.goto('/')

    // Ficheiros gerados na pagina: tres bytes cada, sem assinatura valida.
    // Sao recusados na validacao, portanto o motor nunca arranca e o teste
    // mede o limite e nao a velocidade da conversao.
    const excedente = await page.evaluate(() => {
      const total = 35
      const dt = new DataTransfer()
      for (let i = 0; i < total; i += 1) {
        dt.items.add(new File([new Uint8Array([1, 2, 3])], `f${i}.jpg`, { type: 'image/jpeg' }))
      }
      const input = document.querySelector<HTMLInputElement>('input[type="file"]')
      if (!input) throw new Error('input de ficheiro nao encontrado')
      input.files = dt.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
      return total
    })

    expect(excedente).toBe(35)
    const linhas = page.getByRole('listitem')
    await expect(linhas).toHaveCount(30, ESPERA_LONGA)
    await expect(page.getByText(/Limite de 30 ficheiros atingido/)).toBeVisible()
  })
})
