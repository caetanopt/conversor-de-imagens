/**
 * Gera o fundo da zona de largar a partir do manual de identidade.
 *
 * A fonte e a pagina 38 do manual, seccao 09.4 "Fundo": o campo azul oficial
 * da marca, com o brilho cyan. Nao e uma imagem escolhida por gosto, e o fundo
 * que o manual define.
 *
 * Tres transformacoes, todas com razao:
 *
 *  1. Corta os 22 % de cima, onde esta o lettering. O cabecalho ja mostra a
 *     marca e nenhum outro componente a desenha.
 *  2. Espelha na vertical, para o brilho claro ficar na zona vazia de cima e a
 *     parte escura em baixo, onde assenta o texto.
 *  3. Aplica um veu do azul profundo a 80 %. Sem ele, o pixel mais claro do
 *     brilho da 1,01:1 com texto branco por cima, ou seja, texto invisivel.
 *
 *     80 % e nao menos porque o veu tem de deixar espaco para hierarquia: a
 *     72 % o pior pixel dava 5,33:1 com branco puro, e um branco esbatido para
 *     texto secundario ja caia abaixo de 4,5:1. A 80 % ha margem para os dois
 *     niveis. tests/unit/fundo-da-marca.test.ts mede o ficheiro gravado, acha
 *     o pixel mais claro e confirma que cada token de texto sobre o campo
 *     cumpre o limiar, em qualquer recorte ou posicao do fundo.
 *
 * Correr com: node scripts/gerar-fundo-marca.mjs
 * Precisa de Python com pymupdf e Pillow, as mesmas dependencias que serviram
 * para ler o manual. O resultado esta no repositorio, portanto o build normal
 * nao precisa deste script.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const MANUAL = resolve('docs/brand/Manual_Identidade_Caetano_042026.pdf')
const DESTINO = resolve('public/marca/fundo-caetano.webp')
const PAGINA = 37 // indice de base zero da pagina 38
const IMAGEM = 1 // a segunda imagem da pagina e o campo azul
const CORTE_SUPERIOR = 0.22
const VEU = 0.8
const LARGURA = 1600

if (!existsSync(MANUAL)) {
  console.error(`Manual nao encontrado em ${MANUAL}`)
  process.exit(1)
}

const guiao = `
import pymupdf
from PIL import Image
import io

doc = pymupdf.open(${JSON.stringify(MANUAL)})
ref = doc[${PAGINA}].get_images()[${IMAGEM}][0]
pix = pymupdf.Pixmap(doc, ref)
if pix.n > 3:
    pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
im = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")

largura, altura = im.size
im = im.crop((0, int(altura * ${CORTE_SUPERIOR}), largura, altura))
im = im.transpose(Image.FLIP_TOP_BOTTOM)
im = im.resize((${LARGURA}, round(${LARGURA} * im.height / im.width)), Image.LANCZOS)

veu = Image.new("RGB", im.size, (0, 46, 93))
im = Image.blend(im, veu, ${VEU})
im.save(${JSON.stringify(DESTINO)}, "WEBP", quality=82, method=6)
print(f"{im.width}x{im.height}")
`

const saida = execFileSync('python3', ['-c', guiao], { encoding: 'utf8' }).trim()
console.log(`fundo gravado em public/marca/fundo-caetano.webp (${saida})`)
