/**
 * Gera as fixtures de teste.
 *
 * Sao geradas em vez de guardadas no repositorio, para nao carregar binarios no
 * historico, e sao deterministicas para os testes serem reprodutiveis.
 *
 * Cada fixture existe para exercitar um caminho concreto. O manifesto no fim
 * serve para consulta local; a lista de referencia esta em docs/formatos.md e
 * os testes leem os ficheiros diretamente.
 */
import { readFileSync } from 'node:fs'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  ColorProfile,
  ColorSpace,
  ImageMagick,
  initializeImageMagick,
  Interlace,
  Magick,
  MagickFormat,
  MagickImage,
  MagickReadSettings,
} from '@imagemagick/magick-wasm'

import { perfilAdobeRGB } from './lib/icc.mjs'
import {
  inserirSegmentos,
  segmentoExif,
  segmentoIptc,
  segmentoXmp,
} from './lib/jpeg-segments.mjs'

const raiz = resolve(import.meta.dirname, '..')
const destino = resolve(raiz, 'tests/fixtures')

await initializeImageMagick(
  new Uint8Array(readFileSync(resolve(raiz, 'public/magick/magick.wasm'))),
)

// ------------------------------------------------------------------ ajudantes

/**
 * Semente do gerador de aleatorios do motor.
 *
 * Sem isto, `plasma:` produz uma imagem diferente a cada execucao, e as
 * fixtures deixam de ser reprodutiveis: os tamanhos mudam, os testes que
 * comparam bytes tornam-se instaveis, e os numeros na documentacao ficam
 * errados. Verificado: duas geracoes sem semente dao ficheiros diferentes; com
 * semente fixa dao ficheiros identicos.
 */
export const SEMENTE = 20260101

/** Imagem base. `plasma` da conteudo de alta entropia, o pior caso de compressao. */
function gerar(padrao, largura, altura) {
  Magick.setRandomSeed(SEMENTE)
  const settings = new MagickReadSettings()
  settings.width = largura
  settings.height = altura
  const img = MagickImage.create()
  img.read(padrao, settings)
  for (const nome of ['date:create', 'date:modify', 'date:timestamp']) img.removeAttribute(nome)
  const bytes = img.write(MagickFormat.Png, (d) => new Uint8Array(d))
  img.dispose()
  return Buffer.from(bytes)
}

/**
 * O motor acrescenta atributos `date:*` com a hora atual, e o escritor de PNG
 * grava-os em chunks tEXt. Sem os remover, as fixtures mudam a cada execucao.
 */
const CARIMBOS_DO_MOTOR = ['date:create', 'date:modify', 'date:timestamp']

function escrever(origem, formato, ajustar = () => {}) {
  return Buffer.from(
    ImageMagick.read(origem, (img) => {
      for (const nome of CARIMBOS_DO_MOTOR) img.removeAttribute(nome)
      ajustar(img)
      return img.write(formato, (d) => new Uint8Array(d))
    }),
  )
}

const manifesto = []

async function guardar(nome, bytes, testa) {
  await writeFile(resolve(destino, nome), bytes)
  manifesto.push({ nome, bytes: bytes.length, testa })
  const kb = bytes.length < 1024 ? `${bytes.length} B` : `${(bytes.length / 1024).toFixed(0)} KB`
  console.log(`  ${nome.padEnd(34)} ${kb.padStart(8)}  ${testa}`)
}

// --------------------------------------------------------------------- limpar

await mkdir(destino, { recursive: true })
for (const antigo of await readdir(destino)) {
  if (antigo !== 'manifesto.json') await rm(resolve(destino, antigo), { force: true })
}

console.log('Fixtures de imagem\n')

const base1200 = gerar('plasma:fractal', 1200, 800)
const baseSaturada = gerar('gradient:rgb(230,20,30)-rgb(20,40,220)', 400, 300)

// --------------------------------------------------------------- JPEG simples

await guardar(
  'jpeg-normal.jpg',
  escrever(base1200, MagickFormat.Jpeg, (img) => {
    img.quality = 88
  }),
  'caminho feliz, JPEG baseline',
)

await guardar(
  'jpeg-progressivo.jpg',
  escrever(base1200, MagickFormat.Jpeg, (img) => {
    img.quality = 88
    img.settings.interlace = Interlace.Plane
  }),
  'decode de JPEG progressivo, marcador SOF2',
)

// ---------------------------------------------------------- JPEG com metadados

const jpegLimpo = escrever(baseSaturada, MagickFormat.Jpeg, (img) => {
  img.quality = 90
})

await guardar(
  'jpeg-exif-orientacao-6.jpg',
  inserirSegmentos(jpegLimpo, [segmentoExif({ orientacao: 6, comGps: true })]),
  'auto orient, e remocao de EXIF, GPS e numero de serie',
)

await guardar(
  'jpeg-exif-sem-gps.jpg',
  inserirSegmentos(jpegLimpo, [segmentoExif({ orientacao: 1, comGps: false })]),
  'EXIF sem GPS, orientacao neutra',
)

await guardar(
  'jpeg-xmp.jpg',
  inserirSegmentos(jpegLimpo, [segmentoXmp()]),
  'remocao de XMP, que contem autor e local',
)

await guardar(
  'jpeg-iptc.jpg',
  inserirSegmentos(jpegLimpo, [segmentoIptc()]),
  'remocao de IPTC, que contem autor e legenda',
)

await guardar(
  'jpeg-tudo-metadados.jpg',
  inserirSegmentos(jpegLimpo, [
    segmentoExif({ orientacao: 6, comGps: true }),
    segmentoXmp(),
    segmentoIptc(),
  ]),
  'EXIF, GPS, XMP e IPTC no mesmo ficheiro',
)

// O perfil e anexado pelo proprio motor, para o resultado ser um JPEG valido
// com APP2 correto em vez de uma insercao nossa a mao.
const perfil = new Uint8Array(perfilAdobeRGB())
await guardar(
  'jpeg-icc-adobergb.jpg',
  escrever(baseSaturada, MagickFormat.Jpeg, (img) => {
    img.quality = 90
    img.setProfile(new ColorProfile(perfil))
  }),
  'preservacao do perfil de cor, gamut fora do sRGB',
)

await guardar(
  'jpeg-icc-e-exif.jpg',
  Buffer.from(
    inserirSegmentos(
      escrever(baseSaturada, MagickFormat.Jpeg, (img) => {
        img.quality = 90
        img.setProfile(new ColorProfile(perfil))
      }),
      [segmentoExif({ orientacao: 6, comGps: true })],
    ),
  ),
  'ICC preservado e EXIF removido no mesmo ficheiro',
)

await guardar(
  'jpeg-cmyk.jpg',
  escrever(baseSaturada, MagickFormat.Jpeg, (img) => {
    img.quality = 90
    // CMYK produz um JPEG de 4 componentes. Os browsers nao o descodificam de
    // forma fiavel, por isso e um caso que a nossa validacao tem de cobrir.
    img.colorSpace = ColorSpace.CMYK
  }),
  'JPEG CMYK de 4 componentes, que os browsers nao descodificam de forma fiavel',
)

// ---------------------------------------------------------------------- PNG

await guardar('png-rgb.png', escrever(base1200, MagickFormat.Png), 'PNG opaco')

const comAlfa = Buffer.from(
  ImageMagick.read(baseSaturada, (img) => {
    img.alpha(4) // AlphaOption.Set
    img.evaluate(4, 20, 0.45) // canal alfa, operador Multiply
    return img.write(MagickFormat.Png32, (d) => new Uint8Array(d))
  }),
)
await guardar('png-transparencia.png', comAlfa, 'canal alfa preservado para WebP e perdido em JPEG')

await guardar(
  'png-grande.png',
  escrever(gerar('plasma:fractal', 3000, 2000), MagickFormat.Png),
  '6 MP, para medir tempo e memoria',
)

// --------------------------------------------------------------------- WebP

await guardar(
  'webp-normal.webp',
  escrever(base1200, MagickFormat.WebP, (img) => {
    img.quality = 85
  }),
  'WebP como entrada, e otimizacao WebP para WebP',
)

// --------------------------------------------------------------------- AVIF

await guardar(
  'avif-normal.avif',
  escrever(base1200, MagickFormat.Avif, (img) => {
    img.quality = 60
    // O mesmo define que a aplicacao aplica sempre. Sem ele, gerar esta fixture
    // levaria minutos em vez de segundos.
    img.settings.setDefine(MagickFormat.Heic, 'speed', '9')
  }),
  'AVIF como entrada, e otimizacao AVIF para AVIF',
)

await guardar(
  'avif-transparencia.avif',
  Buffer.from(
    ImageMagick.read(comAlfa, (img) => {
      img.quality = 60
      img.settings.setDefine(MagickFormat.Heic, 'speed', '9')
      return img.write(MagickFormat.Avif, (d) => new Uint8Array(d))
    }),
  ),
  'canal alfa preservado em AVIF',
)

// -------------------------------------------------------- casos degenerados

console.log('\nCasos degenerados\n')

await guardar(
  'corrompido.jpg',
  Buffer.concat([
    // Cabecalho valido, corpo destruido: o decoder tem de falhar com um erro
    // tratado e nao com uma excecao crua.
    Buffer.from(jpegLimpo.subarray(0, 200)),
    Buffer.from(Array.from({ length: 3000 }, (_, i) => (i * 37) % 256)),
  ]),
  'erro de decoder, ficheiro danificado',
)

await guardar(
  'truncado.jpg',
  Buffer.from(jpegLimpo.subarray(0, Math.floor(jpegLimpo.length / 3))),
  'ficheiro incompleto, sem marcador de fim',
)

await guardar(
  'extensao-errada.jpg',
  escrever(baseSaturada, MagickFormat.Png),
  'PNG com extensao .jpg: o formato vem dos bytes, nao do nome',
)

await guardar(
  'sem-extensao',
  escrever(baseSaturada, MagickFormat.Jpeg, (img) => {
    img.quality = 85
  }),
  'ficheiro sem extensao nenhuma',
)

await guardar(
  'minusculo.jpg',
  Buffer.from([0xff, 0xd8, 0xff]),
  'tres bytes: assinatura valida, nada mais',
)

await guardar('vazio.jpg', Buffer.alloc(0), 'ficheiro de zero bytes')

await guardar(
  'nao-e-imagem.jpg',
  Buffer.from('PK\x03\x04 isto e um zip disfarcado de imagem', 'latin1'),
  'assinatura de ZIP: tem de ser recusado',
)

await guardar(
  'fotografia-ferias-2026-acentuacao-ção-日本語.jpg',
  escrever(baseSaturada, MagickFormat.Jpeg, (img) => {
    img.quality = 85
  }),
  'nome Unicode, acentos e caracteres nao latinos',
)

// ------------------------------------------------------------------ manifesto

await writeFile(
  resolve(destino, 'manifesto.json'),
  `${JSON.stringify({ geradoPor: 'scripts/gerar-fixtures.mjs', fixtures: manifesto }, null, 2)}\n`,
)

console.log(`\n${manifesto.length} fixtures, manifesto.json escrito`)
