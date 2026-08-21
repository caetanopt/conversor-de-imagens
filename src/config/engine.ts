/**
 * Identidade do motor de imagem.
 *
 * MAGICK_WASM_VERSION tem de coincidir com a versao instalada em
 * node_modules. scripts/copy-wasm.mjs falha se divergirem, para que uma
 * atualizacao do motor obrigue a revalidar a matriz de formatos antes de
 * chegar a producao.
 */
export const MAGICK_WASM_VERSION = '0.0.42'

/** Servido da nossa origem. Nunca de um CDN de terceiros. */
export const MAGICK_WASM_URL = `/magick/magick.wasm?v=${MAGICK_WASM_VERSION}`

/**
 * Delegates que esta versao do binario tem compilados, lidos em runtime com
 * `Magick.delegates` durante a prova tecnica.
 *
 * Serve de contrato: se uma atualizacao do motor deixar cair um destes, um
 * teste falha em vez de a interface passar a oferecer um formato que ja nao
 * funciona.
 */
export const DELEGATES_ESPERADOS = [
  'freetype', 'heic', 'jng', 'jp2', 'jpeg', 'jxl', 'lcms',
  'lqr', 'openexr', 'png', 'raw', 'tiff', 'webp', 'xml', 'zlib',
] as const

/** Build Q8: 8 bits por canal. Entradas de 16 bits saem reduzidas a 8. */
export const PROFUNDIDADE_DE_CANAL = 8
