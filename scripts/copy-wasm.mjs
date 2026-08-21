/**
 * Copia o binario do ImageMagick de node_modules para public/magick/.
 *
 * Razao: o motor tem de ser servido da nossa propria origem. Se fosse
 * carregado de um CDN de terceiros, existiria um pedido de rede para fora
 * no fluxo de conversao, o que contraria o requisito de privacidade e
 * enfraqueceria a CSP (connect-src 'self').
 */
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pacote = resolve(raiz, 'node_modules/@imagemagick/magick-wasm')
const origem = resolve(pacote, 'dist/magick.wasm')
const destino = resolve(raiz, 'public/magick/magick.wasm')
const constantes = resolve(raiz, 'src/config/engine.ts')

const versaoInstalada = JSON.parse(await readFile(resolve(pacote, 'package.json'), 'utf8')).version

// Guarda: se alguem atualizar a dependencia sem atualizar a constante, falha aqui
// em vez de servir um binario com a versao errada no URL de cache.
const fonteConstantes = await readFile(constantes, 'utf8')
const declarada = /MAGICK_WASM_VERSION = '([^']+)'/.exec(fonteConstantes)?.[1]
if (declarada !== versaoInstalada) {
  console.error(
    `\nErro: versao do motor dessincronizada.\n` +
      `  instalada em node_modules : ${versaoInstalada}\n` +
      `  declarada em src/config/engine.ts : ${declarada ?? 'nao encontrada'}\n\n` +
      `Atualize MAGICK_WASM_VERSION e volte a validar a matriz de formatos\n` +
      `antes de aceitar a nova versao.\n`,
  )
  process.exit(1)
}

await mkdir(dirname(destino), { recursive: true })
await copyFile(origem, destino)
const { size } = await stat(destino)
console.log(`magick.wasm ${versaoInstalada} copiado (${(size / 1024 / 1024).toFixed(1)} MB)`)
