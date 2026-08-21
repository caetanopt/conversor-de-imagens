/**
 * Limites operacionais.
 *
 * Estes valores vem de uma escada de conversoes medida no browser, e nao de
 * estimativas. Chromium 141, 4 nucleos, PNG para WebP q80
 * (ver docs/medicoes.md):
 *
 *   0,5 MP    187 ms      4 MP    1 455 ms     24 MP    9 294 ms
 *     1 MP    415 ms      8 MP    3 175 ms     40 MP   53 493 ms
 *     2 MP    765 ms     12 MP    4 616 ms     60 MP   81 929 ms
 *                        16 MP    6 098 ms    100 MP   o worker morre
 *
 * O tempo cresce de forma nao linear a partir dos 24 MP: entre 24 e 40 MP os
 * pixels aumentam 1,7 vezes e o tempo aumenta 5,8 vezes. E por ai que passa a
 * fronteira do utilizavel, nao pelo ponto de falha.
 *
 * Nenhum browser expoe a memoria linear do WebAssembly a JavaScript, portanto
 * nao ha um numero de bytes para medir. O sinal e o degrau que falha.
 *
 * AVISO: medido em desktop. Em telemovel, sobretudo Safari em iOS, o limite
 * real sera bastante mais baixo. Ver docs/browser-support.md.
 */
export const LIMITES = {
  /** Recusa acima disto. 100 MB cobre TIFF e PNG grandes sem abrir a porta a abusos. */
  maxBytesPorFicheiro: 100 * 1024 * 1024,

  /** Nesta etapa o fluxo e de um ficheiro. O lote chega na etapa do lote. */
  maxFicheiros: 30,

  /**
   * Recusa. 100 MP mata o worker, e 60 MP levou 82 s, que ninguem espera.
   * 40 MP e o maior degrau que ainda concluiu, e cobre qualquer camara atual.
   */
  maxPixels: 40_000_000,

  /** Acima disto a conversao passa de milissegundos a segundos. Medido: 4,6 s a 12 MP. */
  avisoPixels: 12_000_000,

  /** Acima disto passa a dezenas de segundos. Medido: 9,3 s a 24 MP, 53 s a 40 MP. */
  avisoDemoraLongaPixels: 24_000_000,

  /** Acima disto o worker e reciclado depois do trabalho, para devolver memoria. */
  reciclarWorkerAcimaDePixels: 8_000_000,

  /** Acima disto o trabalho corre sozinho, sem concorrencia. Usado a partir do lote. */
  exclusivoAcimaDePixels: 8_000_000,

  /** Conservador de proposito. Cada worker paga o seu proprio heap de WASM. */
  concorrenciaMaxima: 2,

  /** Inclui descarregar 5,1 MB comprimidos e compilar o modulo. */
  timeoutArranqueMotorMs: 60_000,

  /**
   * 40 MP mediu 53 s num desktop de 4 nucleos. Uma maquina mais lenta pode
   * levar duas a tres vezes mais, por isso a folga e ampla. O limite de pixels
   * e que impede esperas absurdas, nao este timeout.
   */
  timeoutConversaoMs: 180_000,

  /** Largura maxima da miniatura. Nunca descodificamos a imagem inteira para preview. */
  larguraPreview: 720,
} as const

export function concorrenciaSugerida(): number {
  const nucleos =
    typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number'
      ? navigator.hardwareConcurrency
      : 2
  return Math.max(1, Math.min(LIMITES.concorrenciaMaxima, nucleos - 1))
}
