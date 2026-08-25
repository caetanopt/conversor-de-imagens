import { existsSync } from 'node:fs'

import { defineConfig, devices } from '@playwright/test'

/**
 * Alguns ambientes trazem o Chromium pre-instalado numa versao diferente da
 * que o Playwright espera. Quando existe, usamos esse binario em vez de
 * descarregar outro; caso contrario deixamos o Playwright resolver.
 */
const CHROMIUM_LOCAL = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium'
const executablePath = existsSync(CHROMIUM_LOCAL) ? CHROMIUM_LOCAL : undefined

/**
 * O servidor e um servidor de ficheiros estaticos sobre `out/`, e nao
 * `next start`, porque a aplicacao e exportada estaticamente. Isso nao e um
 * detalhe de testes: sem runtime de servidor nao existe forma de criar um
 * endpoint de upload, o que e a garantia de privacidade mais forte que temos.
 *
 * Perfis:
 *
 *  - `desktop` e `movel` correm por defeito e usam Chromium.
 *  - `firefox`, `webkit` e `iphone` estao declarados mas exigem os binarios
 *    respetivos. No ambiente onde este projeto e desenvolvido, a politica de
 *    rede bloqueia o CDN do Playwright, por isso nunca correram.
 *    Ver docs/browser-support.md.
 *
 * Para correr tudo numa maquina com os browsers instalados:
 *
 *   npx playwright install firefox webkit
 *   npm run build && npm run fixtures
 *   npx playwright test --project=desktop --project=movel \
 *                       --project=firefox --project=webkit --project=iphone
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 180_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4321',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        ...(executablePath ? { launchOptions: { executablePath } } : {}),
      },
    },
    {
      name: 'movel',
      use: {
        ...devices['Pixel 7'],
        ...(executablePath ? { launchOptions: { executablePath } } : {}),
      },
    },
    // Os tres perfis seguintes nao correm no ambiente de desenvolvimento.
    // Nao usam o executavel local: exigem os binarios proprios do Playwright.
    //
    // ATENCAO ao ler o resultado de uma corrida: nunca canalizar a saida por
    // `tail` ou `head` sem `set -o pipefail`. O codigo de saida passa a ser o
    // do `tail`, sempre zero, e uma corrida com falhas parece verde. Usar
    // `npm run test:e2e:chromium` e ler o codigo de saida real.
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'iphone', use: { ...devices['iPhone 15'] } },
  ],
  webServer: {
    command: 'python3 -m http.server 4321 --directory out --bind 127.0.0.1',
    url: 'http://127.0.0.1:4321/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
