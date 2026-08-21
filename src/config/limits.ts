/**
 * Limites operacionais.
 *
 * Os valores de pixels vem de medicoes reais do motor (ver docs/medicoes.md):
 * o heap estabiliza em cerca de 23 MB por megapixel e a memoria linear do
 * WASM nunca encolhe. Sao por isso limites de memoria disfarcados de limites
 * de dimensao, e devem ser reafinados com medicoes em browsers reais.
 */
export const LIMITES = {
  /** Recusa acima disto. 100 MB cobre TIFF e PNG grandes sem abrir a porta a abusos. */
  maxBytesPorFicheiro: 100 * 1024 * 1024,

  /** Nesta etapa o fluxo e de um ficheiro. O lote chega na etapa do lote. */
  maxFicheiros: 30,

  /** Recusa. A cerca de 23 MB/MP, 100 MP pedem mais de 2 GB e nao cabem em movel. */
  maxPixels: 100_000_000,

  /** Aceita mas avisa: acima disto a conversao leva segundos e pesa em memoria. */
  avisoPixels: 40_000_000,

  /** Acima disto o worker e reciclado depois do trabalho, para devolver memoria. */
  reciclarWorkerAcimaDePixels: 24_000_000,

  /** Acima disto o trabalho corre sozinho, sem concorrencia. Usado a partir do lote. */
  exclusivoAcimaDePixels: 16_000_000,

  /** Conservador de proposito. Cada worker paga o seu proprio heap de WASM. */
  concorrenciaMaxima: 2,

  /** Inclui descarregar 5,1 MB comprimidos e compilar o modulo. */
  timeoutArranqueMotorMs: 60_000,

  /** 24 MP para WebP mediu 8,4 s no pior caso. 120 s da folga ampla. */
  timeoutConversaoMs: 120_000,

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
