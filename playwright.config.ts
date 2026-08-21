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
 * O teste de privacidade e o teste end to end obrigatorio desta etapa.
 * Ver tests/e2e/privacidade.spec.ts e docs/privacidade.md.
 *
 * O servidor e um servidor de ficheiros estaticos sobre `out/`, e nao
 * `next start`, porque a aplicacao e exportada estaticamente. Isso nao e um
 * detalhe de testes: sem runtime de servidor nao existe forma de criar um
 * endpoint de upload, o que e a garantia de privacidade mais forte que temos.
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
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'movel', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'python3 -m http.server 4321 --directory out --bind 127.0.0.1',
    url: 'http://127.0.0.1:4321/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
