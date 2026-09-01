import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test, type Page, type Request } from '@playwright/test'

/**
 * Remocao de fundo, no browser real.
 *
 * O teste unitario prova que o motor produz o canal alfa certo. Este prova as
 * tres coisas que so o browser pode mostrar:
 *
 *  1. o fluxo completo funciona, do ficheiro ao download;
 *  2. o ficheiro descarregado tem transparencia a serio;
 *  3. os dois desfechos maus sao ditos ao utilizador em vez de entregues em
 *     silencio.
 *
 * E, como em toda a suite, que nada disto sai do dispositivo.
 */

const FIXTURES = resolve(import.meta.dirname, '../fixtures')
const FUNDO_UNIFORME = resolve(FIXTURES, 'png-fundo-uniforme.png')
const FUNDO_COMPLEXO = resolve(FIXTURES, 'png-rgb.png')

/** Falha se qualquer pedido levar um corpo. Mesma guarda de privacidade.spec.ts. */
function semCorpo(pagina: Page): () => void {
  const comCorpo: string[] = []
  pagina.on('request', (pedido: Request) => {
    if (pedido.postData()) comCorpo.push(`${pedido.method()} ${pedido.url()}`)
  })
  return () => expect(comCorpo, 'pedidos com corpo').toHaveLength(0)
}

/**
 * O PNG tem transparencia declarada?
 *
 * Ha duas formas validas, e verificar so uma dava um falso negativo: o motor
 * escreve este recorte como PNG indexado (tipo de cor 3) com uma tabela `tRNS`,
 * e nao como RGBA. Medido no ficheiro real:
 *
 *   IHDR cHRM PLTE tRNS bKGD tIME tEXt tEXt tEXt IDAT IEND
 *
 * O byte 25 guarda o tipo de cor: 4 e cinzento com alfa, 6 e RGBA, e 3 e
 * indexado, caso em que a transparencia vive no chunk `tRNS`.
 */
function temTransparencia(bytes: Buffer): boolean {
  const tipoDeCor = bytes[25]
  if (tipoDeCor === 4 || tipoDeCor === 6) return true
  if (tipoDeCor !== 3) return false

  // Percorre os chunks a procura de tRNS, em vez de procurar a string no
  // ficheiro inteiro: 'tRNS' podia aparecer por acidente dentro do IDAT.
  let i = 8
  while (i < bytes.length - 8) {
    const tamanho = bytes.readUInt32BE(i)
    const tipo = bytes.subarray(i + 4, i + 8).toString('latin1')
    if (tipo === 'tRNS') return true
    if (tipo === 'IEND') return false
    i += 12 + tamanho
  }
  return false
}

async function carregar(page: Page, ficheiro: string): Promise<void> {
  await page.goto('/')
  await page.setInputFiles('input[type="file"]', ficheiro)
  await expect(page.getByRole('img', { name: /Pré-visualização/ })).toBeVisible({
    timeout: 120_000,
  })
}

async function ligarRemocao(page: Page): Promise<void> {
  const caixa = page.getByRole('checkbox', { name: /Remover fundo/ })
  await expect(caixa).toBeEnabled({ timeout: 120_000 })
  await caixa.check()
}

test.describe('remocao de fundo', () => {
  test('recorta um fundo uniforme e entrega um PNG com transparencia', async ({ page }) => {
    const verificarPrivacidade = semCorpo(page)
    await carregar(page, FUNDO_UNIFORME)
    await ligarRemocao(page)

    // 'Cor exata' e o defeito, e e o nivel que nao destroi objetos claros.
    await expect(page.getByRole('radio', { name: 'Cor exata' })).toBeChecked()

    await page.getByRole('button', { name: /^Otimizar/ }).click()
    await expect(page.getByText('Tamanho final')).toBeVisible({ timeout: 120_000 })

    // O desfecho e dito, com o numero medido nos pixeis produzidos.
    await expect(page.getByText(/Fundo removido\. Ficaram visíveis \d+ % da imagem\./)).toBeVisible()

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /^Descarregar / }).first().click(),
    ])
    const bytes = readFileSync(await download.path())

    // Assinatura de PNG.
    expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])

    /*
     * E transparencia a serio, nao so um PNG que a poderia ter. Sem esta
     * verificacao, um recorte que nao tivesse acontecido passava o teste.
     */
    expect(temTransparencia(bytes), 'o PNG descarregado tem transparencia').toBe(true)

    verificarPrivacidade()
  })

  test('num fundo fotografico diz que nao encontrou fundo, em vez de entregar um recorte aos pedacos', async ({
    page,
  }) => {
    await carregar(page, FUNDO_COMPLEXO)
    await ligarRemocao(page)

    await page.getByRole('button', { name: /^Otimizar/ }).click()
    await expect(page.getByText('Tamanho final')).toBeVisible({ timeout: 120_000 })

    await expect(page.getByText('Não foi removido fundo nenhum.')).toBeVisible()
    await expect(page.getByText(/não têm uma cor uniforme/)).toBeVisible()
  })

  test('num destino sem canal alfa explica porque nao e possivel', async ({ page }) => {
    await carregar(page, FUNDO_UNIFORME)

    const modoConverter = page.getByRole('radio', { name: 'Converter' })
    await expect(modoConverter).toBeEnabled({ timeout: 120_000 })
    await modoConverter.check()
    await page.getByRole('radio', { name: 'JPG', exact: true }).check()

    // Nem controlo escondido nem promessa falsa: uma explicacao.
    await expect(page.getByText(/Remover o fundo não é possível em JPG/)).toBeVisible()
    await expect(page.getByRole('checkbox', { name: /Remover fundo/ })).toHaveCount(0)
  })

  test('mudar para um formato sem alfa desliga a opcao em vez de a esconder ligada', async ({
    page,
  }) => {
    await carregar(page, FUNDO_UNIFORME)

    const modoConverter = page.getByRole('radio', { name: 'Converter' })
    await expect(modoConverter).toBeEnabled({ timeout: 120_000 })
    await modoConverter.check()

    await page.getByRole('radio', { name: 'WebP', exact: true }).check()
    await ligarRemocao(page)
    await expect(page.getByRole('checkbox', { name: /Remover fundo/ })).toBeChecked()

    // Passa por um formato sem alfa e volta: a opcao nao pode ressuscitar
    // ligada, porque o utilizador deixou de a ver entretanto.
    await page.getByRole('radio', { name: 'JPG', exact: true }).check()
    await page.getByRole('radio', { name: 'WebP', exact: true }).check()
    await expect(page.getByRole('checkbox', { name: /Remover fundo/ })).not.toBeChecked()
  })
})
