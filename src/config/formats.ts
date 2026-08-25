/**
 * Tabela central de capacidades de formato.
 *
 * Esta e a UNICA fonte de verdade sobre formatos. Nenhum componente
 * escreve 'webp' ou '.jpg' a mao. A lista da interface e derivada daqui,
 * filtrada por `release`.
 *
 * Cada entrada reflete comportamento verificado com encode e decode reais
 * contra @imagemagick/magick-wasm 0.0.42. Os valores nao sao copiados da
 * documentacao do ImageMagick, sao o que o binario realmente fez.
 * Ver docs/formatos.md.
 *
 * Para ativar um formato: mudar `release` para 'ativo'. E so isso, desde que
 * exista fixture e o teste do formato passe nos quatro browsers.
 */

export type FormatId = 'jpeg' | 'png' | 'webp' | 'avif' | 'gif' | 'bmp' | 'tiff' | 'ico' | 'heic' | 'jxl'

/**
 * 'ativo'         a interface oferece o formato
 * 'em-avaliacao'  capacidade confirmada no motor, ainda sem fixture e sem
 *                 validacao em browsers reais, por isso escondido
 * 'indisponivel'  o motor nao consegue, e nunca deve aparecer
 */
export type ReleaseFormato = 'ativo' | 'em-avaliacao' | 'indisponivel'

export type ImageFormatCapability = {
  readonly id: FormatId
  readonly label: string
  /** Primeira extensao e a usada na saida. Tupla nao vazia por garantia de tipo. */
  readonly extensions: readonly [string, ...string[]]
  readonly mimeTypes: readonly [string, ...string[]]
  readonly canDecode: boolean
  readonly canEncode: boolean
  readonly supportsAlpha: boolean
  readonly supportsAnimation: boolean
  readonly supportsLossless: boolean
  /** Qualidade com perda, escala 1 a 100. PNG e BMP nao tem, tem nivel de compressao. */
  readonly supportsQuality: boolean

  /**
   * Qualidade mais alta que o encoder com perda aceita.
   *
   * Nao e sempre 100, e as razoes sao diferentes em cada formato:
   *
   *  - AVIF: a qualidade 100 lanca "AOM encoder error: Invalid parameter",
   *    com e sem o define de velocidade. Verificado degrau a degrau: 99 grava,
   *    100 falha. Deixar o deslizador chegar a 100 era um estado alcançavel que
   *    falhava sempre.
   *  - WebP: a qualidade 100 nao e um degrau acima de 99, e o modo sem perda.
   *    Medido, q99 da 326 636 bytes com SSIM 0,008 e q100 da 1 065 458 bytes
   *    com SSIM 0. Esse valor pertence ao controlo de sem perda, para haver
   *    uma unica forma de o pedir.
   *  - JPEG: 100 e o topo normal da escala com perda.
   */
  readonly maxQuality: number
  readonly supportsResize: boolean

  /**
   * Formato real a passar ao motor. Tem de ser sempre um nome que o binario
   * reconheca.
   *
   * Existe por causa de um comportamento verificado: nao ha constante para
   * JFIF (`'Jfif' in MagickFormat` e falso) e nao ha encoder de JFIF (a string
   * crua lanca NoEncodeDelegateForThisImageFormat). Pior: passar um formato
   * invalido a `write` nao lanca, grava no formato de origem e devolve um
   * ficheiro valido do formato errado.
   *
   * Este campo garante que so nomes validos chegam ao motor, e um teste
   * verifica que cada valor aqui existe no enum real da biblioteca.
   */
  readonly magickFormat: string

  /**
   * O que significam varios frames neste formato.
   *
   * Nao e um detalhe academico: decide o que fazer quando a origem tem mais do
   * que um frame e o destino tambem podia ter. Preservar so faz sentido quando
   * os dois lados querem dizer a mesma coisa. Um GIF animado gravado como ICO
   * de varios tamanhos seria um icone com quatro copias da mesma dimensao.
   *
   *  'animacao'  sequencia no tempo (GIF, WebP)
   *  'tamanhos'  a mesma imagem em varias dimensoes (ICO)
   *  'paginas'   documento de varias paginas (TIFF)
   *  'nenhum'    o formato guarda uma imagem so
   */
  readonly multiFrame: 'nenhum' | 'animacao' | 'tamanhos' | 'paginas'

  /** O browser descodifica nativamente, logo a miniatura nao precisa do motor. */
  readonly browserDecodable: boolean

  /**
   * Maior dimensao que a saida pode ter, ou null quando nao ha limite util.
   *
   * Existe por causa do ICO. O motor aceita escrever ate 512x512 e recusa a
   * partir de 640, mas o limite utilizavel e 256: o campo de largura do
   * ICONDIRENTRY tem um byte e o valor 0 significa 256 na norma. Medido, um ICO
   * de 320 px escrito por este motor declara 0, ou seja 256, e passa a mentir
   * sobre as proprias dimensoes. Um ficheiro valido que diz o que nao e.
   */
  readonly maxOutputDimension: number | null

  /**
   * O motor precisa de saber o formato para conseguir ler o ficheiro.
   *
   * Verificado no ICO: `read` e `ping` sem formato explicito lancam
   * NoDecodeDelegateForThisImageFormat, porque os magic bytes (00 00 01 00) sao
   * demasiado fracos para o detetor do ImageMagick decidir. Nos outros formatos
   * ativos o motor identifica sozinho, e nao forcamos: quando o motor discorda
   * da nossa deteccao por assinatura, essa divergencia e informacao util.
   */
  readonly requiresFormatHint: boolean

  readonly defaultQuality: number | null
  readonly release: ReleaseFormato
  readonly notes?: string
}

export const FORMATOS: readonly ImageFormatCapability[] = [
  // ---------------------------------------------------------------- ativos
  {
    id: 'jpeg',
    label: 'JPG',
    extensions: ['jpg', 'jpeg', 'jfif'],
    mimeTypes: ['image/jpeg', 'image/jpg', 'image/pjpeg'],
    canDecode: true,
    canEncode: true,
    supportsAlpha: false,
    supportsAnimation: false,
    supportsLossless: false,
    supportsQuality: true,
    maxQuality: 100,
    supportsResize: true,
    magickFormat: 'JPEG',
    multiFrame: 'nenhum',
    maxOutputDimension: null,
    requiresFormatHint: false,
    browserDecodable: true,
    defaultQuality: 82,
    release: 'ativo',
    notes:
      'JPG, JPEG e JFIF sao o mesmo formato. JFIF e apenas uma extensao aceite: ' +
      'o motor nao tem encoder de JFIF e nao existe constante para ele.',
  },
  {
    id: 'png',
    label: 'PNG',
    extensions: ['png'],
    mimeTypes: ['image/png'],
    canDecode: true,
    canEncode: true,
    supportsAlpha: true,
    supportsAnimation: false,
    supportsLossless: true,
    supportsQuality: false,
    maxQuality: 100,
    supportsResize: true,
    magickFormat: 'PNG',
    multiFrame: 'nenhum',
    maxOutputDimension: null,
    requiresFormatHint: false,
    browserDecodable: true,
    defaultQuality: null,
    release: 'ativo',
    notes:
      'Sem perda, logo nao tem qualidade. O nivel de compressao ' +
      '(png:compression-level) fica para as definicoes avancadas. APNG fora de ambito.',
  },
  {
    id: 'webp',
    label: 'WebP',
    extensions: ['webp'],
    mimeTypes: ['image/webp'],
    canDecode: true,
    canEncode: true,
    supportsAlpha: true,
    supportsAnimation: true,
    supportsLossless: true,
    supportsQuality: true,
    maxQuality: 99,
    supportsResize: true,
    magickFormat: 'WEBP',
    multiFrame: 'animacao',
    maxOutputDimension: null,
    requiresFormatHint: false,
    browserDecodable: true,
    defaultQuality: 80,
    release: 'ativo',
    notes: 'Animacao preservada apenas pela via de colecao de frames.',
  },

  {
    id: 'avif',
    label: 'AVIF',
    extensions: ['avif'],
    mimeTypes: ['image/avif'],
    canDecode: true,
    canEncode: true,
    supportsAlpha: true,
    supportsAnimation: false,
    supportsLossless: false,
    supportsQuality: true,
    maxQuality: 99,
    supportsResize: true,
    magickFormat: 'AVIF',
    multiFrame: 'nenhum',
    maxOutputDimension: null,
    requiresFormatHint: false,
    browserDecodable: true,
    defaultQuality: 60,
    release: 'ativo',
    notes:
      'Exige o define heic:speed, sempre aplicado por resolveEncodeDirectives. ' +
      'Sem ele, 12 MP levaram 19,2 s; com speed 9, 2,1 s. A escala de qualidade ' +
      'nao e comparavel a do WebP: os presets foram calibrados por SSIM. ' +
      'Animacao nao suportada nesta versao.',
  },
  {
    id: 'gif',
    label: 'GIF',
    extensions: ['gif'],
    mimeTypes: ['image/gif'],
    canDecode: true,
    canEncode: true,
    supportsAlpha: true,
    supportsAnimation: true,
    supportsLossless: true,
    supportsQuality: false,
    maxQuality: 100,
    supportsResize: true,
    magickFormat: 'GIF',
    multiFrame: 'animacao',
    maxOutputDimension: null,
    requiresFormatHint: false,
    browserDecodable: true,
    defaultQuality: null,
    release: 'ativo',
    notes:
      'Animacao so sobrevive pela via de colecao. A via de imagem unica achata ' +
      'para 1 frame em silencio, o que o CLAUDE.md proibe, e por isso a ' +
      'conversao passa toda pela colecao. Sem qualidade: o tamanho controla-se ' +
      'pela paleta, e a paleta fica para as definicoes avancadas. Medido: um GIF ' +
      'animado de 10 frames a 320x240 ocupa 475 KB, e o mesmo em WebP 104 KB.',
  },
  {
    id: 'bmp',
    label: 'BMP',
    extensions: ['bmp'],
    mimeTypes: ['image/bmp', 'image/x-ms-bmp'],
    canDecode: true,
    canEncode: true,
    supportsAlpha: true,
    supportsAnimation: false,
    supportsLossless: true,
    supportsQuality: false,
    maxQuality: 100,
    supportsResize: true,
    magickFormat: 'BMP',
    multiFrame: 'nenhum',
    maxOutputDimension: null,
    requiresFormatHint: false,
    browserDecodable: true,
    defaultQuality: null,
    release: 'ativo',
    notes:
      'Sem compressao com perda e sem nivel de compressao util. Existe como ' +
      'entrada, que e o caso real: capturas de ecra antigas e exportacoes de ' +
      'software de Windows. Como saida serve para quem precisa dele, e a ' +
      'interface nao esconde que o ficheiro fica maior.',
  },
  // --------------------------------------------------- confirmados, escondidos
  {
    id: 'tiff',
    label: 'TIFF',
    extensions: ['tiff', 'tif'],
    mimeTypes: ['image/tiff'],
    canDecode: true,
    canEncode: true,
    supportsAlpha: true,
    supportsAnimation: false,
    supportsLossless: true,
    supportsQuality: false,
    maxQuality: 100,
    supportsResize: true,
    magickFormat: 'TIFF',
    multiFrame: 'paginas',
    maxOutputDimension: null,
    requiresFormatHint: false,
    browserDecodable: false,
    defaultQuality: null,
    release: 'ativo',
    notes:
      'O browser nao descodifica TIFF, logo a miniatura vem do motor, pela via ' +
      'de thumbnail. Multipagina preservado de TIFF para TIFF e reduzido a ' +
      'primeira pagina nos outros destinos, sempre com aviso. Build Q8 reduz ' +
      '16 bits por canal a 8, o que e uma perda real e nao reversivel.',
  },
  {
    id: 'ico',
    label: 'ICO',
    extensions: ['ico'],
    mimeTypes: ['image/x-icon', 'image/vnd.microsoft.icon'],
    canDecode: true,
    canEncode: true,
    supportsAlpha: true,
    supportsAnimation: false,
    supportsLossless: true,
    supportsQuality: false,
    maxQuality: 100,
    supportsResize: true,
    magickFormat: 'ICO',
    multiFrame: 'tamanhos',
    maxOutputDimension: 256,
    requiresFormatHint: true,
    browserDecodable: true,
    defaultQuality: null,
    release: 'ativo',
    notes:
      'Magic bytes fracos: o motor recusa ler sem formato explicito, por isso a ' +
      'conversao passa sempre o magickFormat de origem. Um ICO de varios ' +
      'tamanhos e uma colecao, e a via de imagem unica devolvia o menor. Saida ' +
      'limitada a 256 px: acima disso o ICONDIRENTRY declara 256 e o ficheiro ' +
      'mente sobre as proprias dimensoes.',
  },
  {
    id: 'jxl',
    label: 'JPEG XL',
    extensions: ['jxl'],
    mimeTypes: ['image/jxl'],
    canDecode: true,
    canEncode: true,
    supportsAlpha: true,
    supportsAnimation: false,
    supportsLossless: true,
    supportsQuality: true,
    maxQuality: 100,
    supportsResize: true,
    magickFormat: 'JXL',
    multiFrame: 'nenhum',
    maxOutputDimension: null,
    requiresFormatHint: false,
    browserDecodable: false,
    defaultQuality: 80,
    release: 'em-avaliacao',
    notes: 'Encode funciona, mas quase nenhum browser descodifica. Entrada primeiro.',
  },

  // ----------------------------------------------------- entrada apenas
  {
    id: 'heic',
    label: 'HEIC',
    extensions: ['heic', 'heif'],
    mimeTypes: ['image/heic', 'image/heif'],
    canDecode: true,
    canEncode: false,
    supportsAlpha: true,
    supportsAnimation: false,
    supportsLossless: false,
    supportsQuality: false,
    maxQuality: 100,
    supportsResize: true,
    magickFormat: 'HEIC',
    multiFrame: 'nenhum',
    maxOutputDimension: null,
    requiresFormatHint: false,
    browserDecodable: false,
    defaultQuality: null,
    release: 'em-avaliacao',
    notes:
      'Entrada apenas. O motor devolve NoEncodeDelegateForThisImageFormat na escrita, ' +
      'verificado. Cobre o caso do iPhone, HEIC para JPG ou WebP.',
  },
] as const

// ------------------------------------------------------------------ indices

const POR_ID = new Map<FormatId, ImageFormatCapability>(FORMATOS.map((f) => [f.id, f]))

const POR_EXTENSAO = new Map<string, ImageFormatCapability>(
  FORMATOS.flatMap((f) => f.extensions.map((ext) => [ext.toLowerCase(), f] as const)),
)

const POR_MIME = new Map<string, ImageFormatCapability>(
  FORMATOS.flatMap((f) => f.mimeTypes.map((m) => [m.toLowerCase(), f] as const)),
)

export function formatoPorId(id: FormatId): ImageFormatCapability {
  const f = POR_ID.get(id)
  if (!f) throw new Error(`Formato desconhecido: ${id}`)
  return f
}

/** Nao confia na extensao para decidir, so para adivinhar. Ver lib/files/signature.ts. */
export function formatoPorExtensao(nomeDoFicheiro: string): ImageFormatCapability | null {
  const ext = nomeDoFicheiro.split('.').pop()?.toLowerCase()
  return ext ? POR_EXTENSAO.get(ext) ?? null : null
}

export function formatoPorMime(mime: string): ImageFormatCapability | null {
  return POR_MIME.get(mime.toLowerCase().trim()) ?? null
}

/** Formatos que a interface pode oferecer como destino. */
export function formatosDeSaida(): readonly ImageFormatCapability[] {
  return FORMATOS.filter((f) => f.release === 'ativo' && f.canEncode)
}

/** Formatos que a interface aceita como entrada. */
export function formatosDeEntrada(): readonly ImageFormatCapability[] {
  return FORMATOS.filter((f) => f.release === 'ativo' && f.canDecode)
}

/** Para o atributo `accept` do input de ficheiro. */
export function acceptDeEntrada(): string {
  return formatosDeEntrada()
    .flatMap((f) => [...f.mimeTypes, ...f.extensions.map((e) => `.${e}`)])
    .join(',')
}

const POR_MAGICK_FORMAT = new Map<string, ImageFormatCapability>(
  FORMATOS.map((f) => [f.magickFormat.toUpperCase(), f] as const),
)

/**
 * Resolve o nome cru devolvido pelo motor para um formato nosso.
 * Devolve null para formatos que o motor le mas que nao expomos, o que e
 * informacao util e nao um erro.
 */
export function formatoPorMagickFormat(nome: string): ImageFormatCapability | null {
  return POR_MAGICK_FORMAT.get(nome.toUpperCase().trim()) ?? null
}
