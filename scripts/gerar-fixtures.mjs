/**
 * Gera imagens de teste deterministicas para os testes end to end.
 *
 * Sao geradas em vez de guardadas no repositorio, para nao carregar binarios no
 * historico, e usam o proprio motor, o que garante que sao ficheiros validos.
 */
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  ImageMagick,
  initializeImageMagick,
  MagickFormat,
  MagickImage,
  MagickReadSettings,
} from '@imagemagick/magick-wasm'

const raiz = resolve(import.meta.dirname, '..')
const destino = resolve(raiz, 'tests/fixtures')

await initializeImageMagick(
  new Uint8Array(readFileSync(resolve(raiz, 'public/magick/magick.wasm'))),
)

const settings = new MagickReadSettings()
settings.width = 1200
settings.height = 800
const seed = MagickImage.create()
seed.read('plasma:fractal', settings)
const fonte = seed.write(MagickFormat.Png, (d) => new Uint8Array(d))
seed.dispose()

await mkdir(destino, { recursive: true })

const alvos = [
  ['amostra-1200x800.jpg', MagickFormat.Jpeg, 90],
  ['amostra-1200x800.png', MagickFormat.Png, null],
  ['amostra-1200x800.webp', MagickFormat.WebP, 90],
]

for (const [nome, formato, qualidade] of alvos) {
  const bytes = ImageMagick.read(fonte, (img) => {
    if (qualidade !== null) img.quality = qualidade
    return img.write(formato, (d) => new Uint8Array(d))
  })
  await writeFile(resolve(destino, nome), bytes)
  console.log(`${nome.padEnd(26)} ${(bytes.length / 1024).toFixed(0)} KB`)
}

// Ficheiro com extensao de imagem mas assinatura de ZIP, para testar a rejeicao.
await writeFile(resolve(destino, 'nao-e-imagem.jpg'), Buffer.from('PK nao sou imagem'))
console.log('nao-e-imagem.jpg           assinatura de ZIP, deve ser rejeitado')
