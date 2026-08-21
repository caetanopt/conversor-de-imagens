/**
 * Verifica que o motor de imagem nao entra no bundle da main thread.
 *
 * Se o ImageMagick fosse carregado na main thread, a pagina passaria a
 * descarregar 5 MB antes de o utilizador escolher um ficheiro, e a conversao
 * poderia acontecer fora do worker, bloqueando a interface. Esta verificacao
 * corre depois do build, contra os ficheiros reais que vao para producao.
 */
import { existsSync, readFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const raiz = resolve(import.meta.dirname, '..')
const out = join(raiz, 'out')

if (!existsSync(out)) {
  console.error('Erro: pasta out/ nao existe. Corra `npm run build` primeiro.')
  process.exit(1)
}

/** Marcador inequivoco da biblioteca, nao apenas do nosso registry de formatos. */
const MARCADOR_DO_MOTOR = 'initializeImageMagick'
const pastaChunks = join(out, '_next/static/chunks')

const html = readFileSync(join(out, 'index.html'), 'utf8')
const referenciados = [...html.matchAll(/\/_next\/static\/chunks\/([\w.-]+\.js)/g)].map((m) => m[1])
const naMainThread = [...new Set(referenciados)]

if (naMainThread.length === 0) {
  console.error('Erro: nenhum chunk encontrado em index.html. A verificacao seria vazia.')
  process.exit(1)
}

function contemMotor(nome) {
  const caminho = join(pastaChunks, nome)
  return existsSync(caminho) && readFileSync(caminho, 'utf8').includes(MARCADOR_DO_MOTOR)
}

const infratores = naMainThread.filter(contemMotor)

// Contraprova: o motor tem de existir em algum chunk. Sem isto, a verificacao
// passaria por vacuidade se a biblioteca mudasse de nome interno.
const todos = await readdir(pastaChunks)
const comMotor = todos.filter((nome) => nome.endsWith('.js') && contemMotor(nome))

console.log(`chunks carregados pela pagina : ${naMainThread.length}`)
console.log(`chunks que contem o motor     : ${comMotor.length > 0 ? comMotor.join(', ') : 'nenhum'}`)

if (comMotor.length === 0) {
  console.error(
    `\nErro: o marcador "${MARCADOR_DO_MOTOR}" nao aparece em nenhum chunk.\n` +
      'A biblioteca mudou de nome interno e esta verificacao deixou de ser valida.\n',
  )
  process.exit(1)
}

if (infratores.length > 0) {
  console.error(
    '\nErro: o motor de imagem entrou no bundle da main thread.\n' +
      `Chunks em causa: ${infratores.join(', ')}\n\n` +
      'O magick-wasm so pode ser importado por src/workers/image.worker.ts.\n',
  )
  process.exit(1)
}

console.log('\nOK: o motor esta isolado fora dos chunks da main thread.')
