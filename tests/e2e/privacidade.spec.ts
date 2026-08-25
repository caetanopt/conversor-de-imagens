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
const AMOSTRA_JPG = resolve(FIXTURES, 'jpeg-normal.jpg')
const ORIGEM = 'http://127.0.0.1:4321'

type PedidoGravado = {
  readonly url: string
  readonly metodo: string
  readonly corpo: string | null
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
      corpo,
      bytesEnviados: corpo ? Buffer.byteLength(corpo) : 0,
      contentType: pedido.headers()['content-type'] ?? '',
    })
  })
  return pedidos
}

/**
 * Amostras de bytes retiradas do ficheiro de origem, para procurar nos pedidos.
 *
 * A verificacao "nenhum pedido tem corpo" ja e forte, mas nao cobre exfiltracao
 * por URL nem por cabecalho. Esta procura por conteudo cobre isso: se qualquer
 * representacao dos bytes da imagem aparecer em qualquer pedido, falha.
 */
function amostrasDoFicheiro(caminho: string): readonly { rotulo: string; agulha: string }[] {
  const bytes = readFileSync(caminho)
  const amostras: { rotulo: string; agulha: string }[] = []

  // Tres janelas de 24 bytes, em posicoes diferentes do ficheiro.
  for (const [rotulo, offset] of [
    ['inicio', 0],
    ['meio', Math.floor(bytes.length / 2)],
    ['fim', bytes.length - 24],
  ] as const) {
    const janela = bytes.subarray(offset, offset + 24)
    amostras.push({ rotulo: `${rotulo} em latin1`, agulha: janela.toString('latin1') })
    amostras.push({ rotulo: `${rotulo} em base64`, agulha: janela.toString('base64') })
    amostras.push({ rotulo: `${rotulo} em hexadecimal`, agulha: janela.toString('hex') })
  }

  return amostras
}

test.describe('processamento local', () => {
  test('converte JPG para WebP sem enviar bytes para nenhum servidor', async ({ page }) => {
    const pedidos = gravarPedidos(page)
    await page.goto('/')

    await page.setInputFiles('input[type="file"]', AMOSTRA_JPG)
    await expect(page.getByText('jpeg-normal.jpg')).toBeVisible()

    await expect(page.getByRole('img', { name: /Pré-visualização/ })).toBeVisible({
      timeout: 120_000,
    })
    await expect(page.getByText('1200 x 800')).toBeVisible()
    await expect(page.getByRole('radio', { name: 'WebP' })).toBeChecked()

    const botaoConverter = page.getByRole('button', { name: /Converter para WebP/ })
    await expect(botaoConverter).toBeEnabled({ timeout: 120_000 })
    await botaoConverter.click()

    await expect(page.getByText('Tamanho final')).toBeVisible({ timeout: 120_000 })
    await expect(page.getByText(/Processado no seu dispositivo em/)).toBeVisible()

    const descarregar = page.getByRole('button', { name: /Descarregar/ })
    await expect(descarregar).toBeVisible()
    const [download] = await Promise.all([page.waitForEvent('download'), descarregar.click()])

    expect(download.suggestedFilename()).toBe('jpeg-normal.webp')
    const resultado = readFileSync(await download.path())
    expect(resultado.subarray(0, 4).toString('latin1')).toBe('RIFF')
    expect(resultado.subarray(8, 12).toString('latin1')).toBe('WEBP')

    // ------------------------------------------------------------------
    // 1. Nenhum pedido leva corpo.
    // ------------------------------------------------------------------
    const comCorpo = pedidos.filter((p) => p.bytesEnviados > 0)
    expect(comCorpo.map((p) => p.url), 'pedidos com corpo').toHaveLength(0)
    expect(pedidos.filter((p) => p.metodo !== 'GET').map((p) => p.url)).toHaveLength(0)
    expect(pedidos.filter((p) => p.contentType.includes('multipart'))).toHaveLength(0)
    expect(pedidos.reduce((t, p) => t + p.bytesEnviados, 0)).toBe(0)

    // ------------------------------------------------------------------
    // 2. Nada sai da nossa origem.
    // ------------------------------------------------------------------
    const deRede = pedidos.filter((p) => p.url.startsWith('http:') || p.url.startsWith('https:'))
    const foraDaOrigem = deRede.filter((p) => !p.url.startsWith(ORIGEM))
    expect(foraDaOrigem.map((p) => p.url), 'pedidos para outra origem').toHaveLength(0)

    for (const pedido of pedidos.filter((p) => !deRede.includes(p))) {
      expect(pedido.url, `esquema inesperado: ${pedido.url}`).toMatch(
        new RegExp(`^(blob:${ORIGEM.replace(/[.:/]/g, '\\$&')}/|data:)`),
      )
    }

    // ------------------------------------------------------------------
    // 3. Nenhuma representacao dos bytes da imagem aparece em pedido nenhum,
    //    nem no URL, nem no corpo. Cobre exfiltracao por query string.
    // ------------------------------------------------------------------
    const amostras = amostrasDoFicheiro(AMOSTRA_JPG)
    expect(amostras.length).toBeGreaterThan(0)

    for (const { rotulo, agulha } of amostras) {
      for (const pedido of pedidos) {
        expect(pedido.url.includes(agulha), `${rotulo} apareceu no URL ${pedido.url}`).toBe(false)
        if (pedido.corpo) {
          expect(pedido.corpo.includes(agulha), `${rotulo} apareceu no corpo de ${pedido.url}`).toBe(
            false,
          )
        }
      }
    }

    // Contraprova das agulhas: elas existem de facto no ficheiro de origem.
    // Sem isto, esta seccao passaria com agulhas vazias.
    const original = readFileSync(AMOSTRA_JPG).toString('latin1')
    const emLatin1 = amostras.filter((a) => a.rotulo.endsWith('latin1'))
    for (const { rotulo, agulha } of emLatin1) {
      expect(original.includes(agulha), `agulha ${rotulo} nao existe no original`).toBe(true)
    }

    // ------------------------------------------------------------------
    // 4. Contraprova geral: a pagina fez pedidos, incluindo o binario do motor.
    // ------------------------------------------------------------------
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
      indexedDB:
        typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).length : -1,
      caches: typeof caches !== 'undefined' ? (await caches.keys()).length : -1,
      serviceWorkers: navigator.serviceWorker
        ? (await navigator.serviceWorker.getRegistrations()).length
        : -1,
    }))

    // O fluxo de conversao nao guarda nada, nem uma chave. A preferencia de
    // tema so aparece se o utilizador carregar no botao, e o teste seguinte
    // limita exatamente o que esse botao pode escrever.
    expect(armazenamento.localStorage).toBe(0)
    expect(armazenamento.sessionStorage).toBe(0)
    expect(armazenamento.indexedDB).toBeLessThanOrEqual(0)
    expect(armazenamento.caches).toBeLessThanOrEqual(0)
    expect(armazenamento.serviceWorkers).toBeLessThanOrEqual(0)
  })

  test('a preferencia de tema e a unica coisa que pode ficar guardada', async ({ page }) => {
    /*
     * O interruptor de tema e a unica escrita em localStorage em toda a
     * aplicacao. Contar zero chaves aqui seria impossivel, porque a escolha
     * tem de sobreviver ao recarregamento para o controlo servir de algo. Em
     * vez disso este teste limita o que pode existir: uma chave, com nome
     * conhecido, e um valor de entre dois. Uma escrita nova em localStorage
     * falha aqui.
     */
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')
    await page.setInputFiles('input[type="file"]', AMOSTRA_JPG)

    const tema = page.getByRole('switch')
    // Sem escolha guardada e o sistema em claro, o interruptor comeca
    // desligado. Esperar por isto garante que o React ja hidratou: sem isso o
    // primeiro clique podia cair antes disso e nao fazer nada.
    await expect(tema).toHaveAttribute('aria-checked', 'false')
    expect(await page.evaluate(() => Object.keys(localStorage).length)).toBe(0)

    // Um clique liga o interruptor e guarda a escolha explicita.
    await tema.click()
    await expect(tema).toHaveAttribute('aria-checked', 'true')
    let guardado = await page.evaluate(() =>
      Object.entries(localStorage).map(([chave, valor]) => `${chave}=${valor}`),
    )
    expect(guardado).toEqual(['conversor:tema=escuro'])

    // Um segundo clique desliga outra vez, sem deixar uma segunda chave.
    await tema.click()
    await expect(tema).toHaveAttribute('aria-checked', 'false')
    guardado = await page.evaluate(() =>
      Object.entries(localStorage).map(([chave, valor]) => `${chave}=${valor}`),
    )
    expect(guardado).toEqual(['conversor:tema=claro'])

    // E nada mudou nos outros mecanismos de persistencia.
    const resto = await page.evaluate(async () => ({
      sessionStorage: Object.keys(sessionStorage).length,
      indexedDB:
        typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).length : -1,
      caches: typeof caches !== 'undefined' ? (await caches.keys()).length : -1,
    }))
    expect(resto.sessionStorage).toBe(0)
    expect(resto.indexedDB).toBeLessThanOrEqual(0)
    expect(resto.caches).toBeLessThanOrEqual(0)
  })

  test('o inventario de pedidos e exatamente o documentado', async ({ page }) => {
    // Este teste existe para docs/privacidade.md nao envelhecer em silencio.
    // Se um pedido novo aparecer no fluxo normal, falha aqui e a documentacao
    // tem de ser atualizada em conjunto.
    const pedidos = gravarPedidos(page)
    await page.goto('/')
    await page.setInputFiles('input[type="file"]', AMOSTRA_JPG)
    const botao = page.getByRole('button', { name: /Converter para WebP/ })
    await expect(botao).toBeEnabled({ timeout: 120_000 })
    await botao.click()
    await expect(page.getByText('Tamanho final')).toBeVisible({ timeout: 120_000 })

    const PADROES_PERMITIDOS = [
      /^http:\/\/127\.0\.0\.1:4321\/$/,
      /^http:\/\/127\.0\.0\.1:4321\/_next\/static\//,
      /^http:\/\/127\.0\.0\.1:4321\/magick\/magick\.wasm(\?|$)/,
      /^http:\/\/127\.0\.0\.1:4321\/favicon\.ico$/,
      // O icone da marca, gerado a partir de src/app/icon.svg.
      /^http:\/\/127\.0\.0\.1:4321\/icon\.svg(\?|$)/,
      // O campo azul do manual, fundo da zona de largar.
      /^http:\/\/127\.0\.0\.1:4321\/marca\/fundo-caetano\.webp(\?|$)/,
      /^blob:http:\/\/127\.0\.0\.1:4321\//,
    ]

    const inesperados = pedidos.filter(
      (p) => !PADROES_PERMITIDOS.some((padrao) => padrao.test(p.url)),
    )
    expect(
      inesperados.map((p) => `${p.metodo} ${p.url}`),
      'pedidos fora do inventario de docs/privacidade.md',
    ).toHaveLength(0)
  })
})

test.describe('estados da interface', () => {
  /** Cada caso e um ficheiro real de tests/fixtures. */
  const CASOS_INVALIDOS: readonly { fixture: string; mensagem: RegExp }[] = [
    { fixture: 'nao-e-imagem.jpg', mensagem: /não parece ser uma imagem/i },
    { fixture: 'vazio.jpg', mensagem: /está vazio/i },
    { fixture: 'minusculo.jpg', mensagem: /danificad|incomplet|vazio/i },
  ]

  for (const { fixture, mensagem } of CASOS_INVALIDOS) {
    test(`${fixture} da uma mensagem compreensivel`, async ({ page }) => {
      await page.goto('/')
      await page.setInputFiles('input[type="file"]', resolve(FIXTURES, fixture))

      const painel = page.getByRole('complementary', { name: 'Ficheiro' })
      const alerta = painel.getByRole('alert')
      await expect(alerta).toBeVisible()
      await expect(alerta).toContainText(mensagem)

      // Nenhum vestigio da biblioteca no ecra.
      const texto = (await alerta.textContent()) ?? ''
      expect(texto).not.toMatch(/NoDecodeDelegate|error\/|0x[0-9a-f]{2}|magick|wasm/i)

      await expect(page.getByRole('button', { name: /^Converter para/ })).toBeDisabled()
    })
  }

  test('um ficheiro corrompido falha na conversao com mensagem tratada', async ({ page }) => {
    // Este passa a validacao de assinatura porque o cabecalho e valido, e so
    // falha quando o decoder chega ao corpo destruido.
    await page.goto('/')
    await page.setInputFiles('input[type="file"]', resolve(FIXTURES, 'corrompido.jpg'))

    const painel = page.getByRole('complementary', { name: 'Ficheiro' })
    await expect(painel.getByRole('alert')).toBeVisible({ timeout: 120_000 })
    const texto = (await painel.getByRole('alert').textContent()) ?? ''
    expect(texto).toMatch(/danificad|incomplet|não foi possível/i)
    expect(texto).not.toMatch(/marker|error\/|0x[0-9a-f]{2}/i)
  })

  test('um PNG com extensao .jpg e tratado como PNG', async ({ page }) => {
    await page.goto('/')
    await page.setInputFiles('input[type="file"]', resolve(FIXTURES, 'extensao-errada.jpg'))

    // O aviso diz o que vai acontecer, em vez de tratar em silencio.
    await expect(page.getByText(/conteúdo é PNG/i)).toBeVisible()
    // E o destino sugerido continua a ser WebP, porque a origem e PNG.
    await expect(page.getByRole('radio', { name: 'WebP' })).toBeChecked()
  })

  test('um ficheiro sem extensao funciona normalmente', async ({ page }) => {
    await page.goto('/')
    await page.setInputFiles('input[type="file"]', resolve(FIXTURES, 'sem-extensao'))
    await expect(page.getByRole('img', { name: /Pré-visualização/ })).toBeVisible({
      timeout: 120_000,
    })
    await expect(page.getByRole('button', { name: /Converter para WebP/ })).toBeEnabled()
  })

  test('um nome Unicode sobrevive ao descarregamento', async ({ page }) => {
    // O ficheiro e construido dentro da pagina, e nao com setInputFiles.
    //
    // Razao: neste Playwright, `setInputFiles` anexa ZERO ficheiros, em
    // silencio e sem lancar, para qualquer nome com um carater fora de ASCII.
    // Verificado com "ção", "áéí", cirilico, CJK e emoji: todos dao
    // files.length === 0. Um nome ASCII com o mesmo conteudo funciona.
    //
    // Injetar via DataTransfer testa o caminho real da aplicacao, incluindo o
    // evento change, sem passar pela limitacao da ferramenta.
    const nome = 'fotografia-férias-2026-ção-日本語.jpg'
    const bytes = [...readFileSync(AMOSTRA_JPG)]

    await page.goto('/')
    await page.evaluate(
      ({ nome, bytes }) => {
        const input = document.querySelector<HTMLInputElement>('input[type="file"]')
        if (!input) throw new Error('input de ficheiro nao encontrado')
        const ficheiro = new File([new Uint8Array(bytes)], nome, { type: 'image/jpeg' })
        const dt = new DataTransfer()
        dt.items.add(ficheiro)
        input.files = dt.files
        input.dispatchEvent(new Event('change', { bubbles: true }))
      },
      { nome, bytes },
    )

    // O nome chega intacto a interface.
    await expect(page.getByTitle(nome)).toBeVisible({ timeout: 120_000 })

    const botao = page.getByRole('button', { name: /Converter para WebP/ })
    await expect(botao).toBeEnabled({ timeout: 120_000 })
    await botao.click()

    const descarregar = page.getByRole('button', { name: /Descarregar/ })
    await expect(descarregar).toBeVisible({ timeout: 120_000 })
    const [download] = await Promise.all([page.waitForEvent('download'), descarregar.click()])

    // O conteudo descarregado e um WebP valido.
    const resultado = readFileSync(await download.path())
    expect(resultado.subarray(0, 4).toString('latin1')).toBe('RIFF')
    expect(resultado.subarray(8, 12).toString('latin1')).toBe('WEBP')

    // NAO verificamos aqui o nome do ficheiro descarregado.
    //
    // Neste Chromium headless, um `<a download>` com qualquer carater fora de
    // ASCII faz `suggestedFilename()` devolver "download". Verificado com tres
    // linhas de HTML puro, sem codigo da aplicacao envolvido, portanto e
    // comportamento do ambiente e nao nosso.
    //
    // A logica de nomes esta coberta em tests/unit/fileNames.test.ts, incluindo
    // acentos, cirilico, CJK, emoji e as formas NFC e NFD. O nome apresentado na
    // interface e verificado acima com getByTitle.
    //
    // Fica em aberto: confirmar a mao, num browser normal, que o ficheiro
    // guardado mantem o nome. Registado em docs/browser-support.md.
    expect(download.suggestedFilename().length).toBeGreaterThan(0)
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

test.describe('redimensionamento', () => {
  test('reduz as dimensoes e o tamanho, preservando a proporcao', async ({ page }) => {
    await page.goto('/')
    await page.setInputFiles('input[type="file"]', AMOSTRA_JPG)
    await expect(page.getByText('1200 x 800')).toBeVisible({ timeout: 120_000 })

    await page.getByRole('checkbox', { name: 'Redimensionar' }).check()
    await page.getByRole('spinbutton', { name: 'Largura' }).fill('600')

    // A previsao aparece antes de converter, com a altura calculada.
    await expect(page.getByText('1200 x 800 para 600 x 400')).toBeVisible()

    await page.getByRole('button', { name: /Converter para WebP/ }).click()
    await expect(page.getByText('Tamanho final')).toBeVisible({ timeout: 120_000 })

    // O resumo mostra a dimensao final, que tem de ser a prometida.
    const resultado = page.getByRole('region', { name: 'Comparação do resultado' })
    await expect(resultado.getByText('600 x 400')).toBeVisible()

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Descarregar/ }).click(),
    ])
    const bytes = readFileSync(await download.path())
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('RIFF')

    // Um WebP de 600x400 tem as dimensoes no cabecalho VP8. Verificamos o
    // tamanho como sinal: metade das dimensoes da bem menos de metade dos bytes.
    expect(bytes.byteLength).toBeLessThan(readFileSync(AMOSTRA_JPG).byteLength / 2)
  })

  test('nao aumenta imagens pequenas sem pedido explicito', async ({ page }) => {
    await page.goto('/')
    await page.setInputFiles('input[type="file"]', AMOSTRA_JPG)
    await expect(page.getByText('1200 x 800')).toBeVisible({ timeout: 120_000 })

    await page.getByRole('checkbox', { name: 'Redimensionar' }).check()
    await page.getByRole('spinbutton', { name: 'Largura' }).fill('2400')

    // Diz que nao vai aumentar, em vez de aumentar em silencio.
    await expect(page.getByText('1200 x 800 para 1200 x 800')).toBeVisible()
    await expect(page.getByText(/maiores que o original/)).toBeVisible()

    await page.getByRole('checkbox', { name: 'Permitir aumentar' }).check()
    await expect(page.getByText('1200 x 800 para 2400 x 1600')).toBeVisible()
  })
})

test.describe('AVIF', () => {
  test('converte JPG para AVIF e o ficheiro e um AVIF valido', async ({ page }) => {
    await page.goto('/')
    await page.setInputFiles('input[type="file"]', AMOSTRA_JPG)
    await expect(page.getByRole('radio', { name: 'AVIF' })).toBeVisible({ timeout: 120_000 })

    await page.getByRole('radio', { name: 'AVIF' }).check()
    await page.getByRole('button', { name: /Converter para AVIF/ }).click()
    await expect(page.getByText('Tamanho final')).toBeVisible({ timeout: 120_000 })

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Descarregar/ }).click(),
    ])
    expect(download.suggestedFilename()).toBe('jpeg-normal.avif')

    // Contentor ISOBMFF com a marca avif: ftyp no offset 4, marca no offset 8.
    const bytes = readFileSync(await download.path())
    expect(bytes.subarray(4, 8).toString('latin1')).toBe('ftyp')
    expect(bytes.subarray(8, 12).toString('latin1')).toBe('avif')
  })

  test('aceita um AVIF como entrada', async ({ page }) => {
    await page.goto('/')
    await page.setInputFiles('input[type="file"]', resolve(FIXTURES, 'avif-normal.avif'))
    await expect(page.getByRole('img', { name: /Pré-visualização/ })).toBeVisible({
      timeout: 120_000,
    })
    await expect(page.getByText('1200 x 800')).toBeVisible()
    // A origem e AVIF, logo o destino sugerido e WebP.
    await expect(page.getByRole('radio', { name: 'WebP' })).toBeChecked()
  })
})

test.describe('otimizar no mesmo formato', () => {
  test('otimizar mantem o formato de origem e o resultado e descarregavel', async ({ page }) => {
    await page.goto('/')
    await page.setInputFiles('input[type="file"]', AMOSTRA_JPG)
    await expect(page.getByRole('img', { name: /Pré-visualização/ })).toBeVisible({
      timeout: 120_000,
    })

    await page.getByRole('radio', { name: 'Otimizar' }).check()

    // Em modo de otimizacao nao ha escolha de formato: o destino e a origem.
    await expect(page.getByText(/Mantém JPG/)).toBeVisible()
    await expect(page.getByRole('radio', { name: 'PNG' })).toBeHidden()

    const converter = page.getByRole('button', { name: /Converter para JPG/ })
    await expect(converter).toBeEnabled()
    await converter.click()

    await expect(page.getByText('Tamanho final')).toBeVisible({ timeout: 120_000 })
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Descarregar/ }).click(),
    ])
    expect(download.suggestedFilename()).toBe('jpeg-normal.jpg')

    const resultado = readFileSync(await download.path())
    expect(resultado.subarray(0, 3).toString('hex')).toBe('ffd8ff')
  })

  test('a politica de metadados por defeito remove dados privados', async ({ page }) => {
    await page.goto('/')
    await page.setInputFiles('input[type="file"]', resolve(FIXTURES, 'jpeg-tudo-metadados.jpg'))

    const converter = page.getByRole('button', { name: /Converter para WebP/ })
    await expect(converter).toBeEnabled({ timeout: 120_000 })

    // O valor por defeito e visivel na interface, nao escondido.
    await expect(page.getByRole('radio', { name: 'Remover, manter cor' })).toBeChecked()
    await converter.click()

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      (async () => {
        await expect(page.getByRole('button', { name: /Descarregar/ })).toBeVisible({
          timeout: 120_000,
        })
        await page.getByRole('button', { name: /Descarregar/ }).click()
      })(),
    ])

    const saida = readFileSync(await download.path()).toString('latin1')
    for (const privado of ['SN-0123456789', 'Fabricante de Teste', 'Autor de Teste', 'Lisboa']) {
      expect(saida.includes(privado), `${privado} sobreviveu ao descarregamento`).toBe(false)
    }
  })
})
