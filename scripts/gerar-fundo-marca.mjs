/**
 * Gera o fundo da zona de largar a partir da fotografia da marca.
 *
 * A fonte e `docs/brand/caetano.webp`, fornecida diretamente para esta
 * pagina: uma fotografia aerea de um no rodoviario, com o lettering
 * "caetano" e rastos de luz cyan sobre azul profundo.
 *
 * Ao contrario da versao anterior deste script, que recortava, espelhava e
 * aplicava um veu forte a um campo de cor liso extraido do manual, esta
 * versao so redimensiona e recomprime. Nao ha veu: o texto da interface ja
 * nao assenta diretamente na fotografia, assenta num painel solido definido
 * em tokens.css (--field-painel) e aplicado em DropZone.module.css. A
 * fotografia fica livre para mostrar o lettering e os rastos de luz tal como
 * foram entregues.
 *
 * Correr com: node scripts/gerar-fundo-marca.mjs
 * Precisa de Pillow (Python). O resultado esta no repositorio, portanto o
 * build normal nao corre este script.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ORIGEM = resolve('docs/brand/caetano.webp')
const DESTINO = resolve('public/marca/fundo-caetano.webp')
const LARGURA = 1600
const QUALIDADE = 75

if (!existsSync(ORIGEM)) {
  console.error(`Fotografia nao encontrada em ${ORIGEM}`)
  process.exit(1)
}

const guiao = `
from PIL import Image

im = Image.open(${JSON.stringify(ORIGEM)}).convert("RGB")
largura, altura = im.size
nova_altura = round(${LARGURA} * altura / largura)
im = im.resize((${LARGURA}, nova_altura), Image.LANCZOS)
im.save(${JSON.stringify(DESTINO)}, "WEBP", quality=${QUALIDADE}, method=6)
print(f"{im.width}x{im.height}")
`

const saida = execFileSync('python3', ['-c', guiao], { encoding: 'utf8' }).trim()
console.log(`fundo gravado em public/marca/fundo-caetano.webp (${saida})`)
