/**
 * Insercao de segmentos de metadados em JPEG, byte a byte.
 *
 * O magick-wasm nao permite escrever EXIF, XMP ou IPTC arbitrarios, por isso as
 * fixtures que testam a remocao de metadados tem de ser montadas a mao. Sem
 * ficheiros reais com estes segmentos, os testes de privacidade sobre metadados
 * seriam vazios.
 *
 * Estrutura de um JPEG: SOI (FFD8), sequencia de segmentos
 * (FFxx + comprimento de 2 bytes que inclui os proprios 2 bytes), e depois os
 * dados comprimidos. Os segmentos de aplicacao APPn tem de vir logo depois do
 * SOI, antes de qualquer outro.
 */

const SOI = Buffer.from([0xff, 0xd8])

function u16be(v) {
  const b = Buffer.alloc(2)
  b.writeUInt16BE(v, 0)
  return b
}

function u32be(v) {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(v, 0)
  return b
}

/** Monta um segmento APPn com o payload dado. */
function segmento(marcador, payload) {
  return Buffer.concat([Buffer.from([0xff, marcador]), u16be(payload.length + 2), payload])
}

/** Insere segmentos imediatamente depois do SOI. */
export function inserirSegmentos(jpeg, segmentos) {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('Nao e um JPEG: falta o SOI')
  return Buffer.concat([SOI, ...segmentos, jpeg.subarray(2)])
}

// ------------------------------------------------------------------- EXIF

const TIPO = { BYTE: 1, ASCII: 2, SHORT: 3, LONG: 4, RATIONAL: 5 }

/**
 * Monta um IFD com valores que caibam nos 4 bytes da entrada, ou apontados
 * para uma area de dados a seguir ao IFD.
 */
function montarIfd(entradas, deslocamentoBase, proximoIfd = 0) {
  const cabecalhoTamanho = 2 + entradas.length * 12 + 4
  let deslocamentoDados = deslocamentoBase + cabecalhoTamanho
  const linhas = []
  const dados = []

  for (const { tag, tipo, valores } of entradas) {
    const bytes = codificar(tipo, valores)
    const contagem =
      tipo === TIPO.ASCII ? bytes.length : tipo === TIPO.RATIONAL ? valores.length / 2 : valores.length

    if (bytes.length <= 4) {
      const preenchido = Buffer.alloc(4)
      bytes.copy(preenchido, 0)
      linhas.push(Buffer.concat([u16be(tag), u16be(tipo), u32be(contagem), preenchido]))
    } else {
      linhas.push(Buffer.concat([u16be(tag), u16be(tipo), u32be(contagem), u32be(deslocamentoDados)]))
      dados.push(bytes)
      deslocamentoDados += bytes.length + (bytes.length % 2)
      if (bytes.length % 2) dados.push(Buffer.alloc(1))
    }
  }

  return {
    buffer: Buffer.concat([u16be(entradas.length), ...linhas, u32be(proximoIfd), ...dados]),
    fim: deslocamentoDados,
  }
}

function codificar(tipo, valores) {
  if (tipo === TIPO.ASCII) return Buffer.from(`${valores}\0`, 'latin1')
  if (tipo === TIPO.SHORT) return Buffer.concat(valores.map(u16be))
  if (tipo === TIPO.LONG) return Buffer.concat(valores.map(u32be))
  if (tipo === TIPO.RATIONAL) return Buffer.concat(valores.map(u32be))
  if (tipo === TIPO.BYTE) return Buffer.from(valores)
  throw new Error(`Tipo EXIF nao suportado: ${tipo}`)
}

/**
 * EXIF com orientacao, fabricante, modelo, numero de serie e coordenadas GPS.
 *
 * Cada um destes campos existe por uma razao no teste:
 *  - Orientation muda como a imagem deve ser apresentada
 *  - Make, Model e BodySerialNumber identificam o equipamento
 *  - as coordenadas GPS identificam o local
 */
export function segmentoExif({ orientacao = 6, comGps = true } = {}) {
  // O GPS IFD vai depois do IFD0. Montamos o IFD0 uma vez para saber o tamanho.
  const entradasIfd0 = [
    { tag: 0x010f, tipo: TIPO.ASCII, valores: 'Fabricante de Teste' },
    { tag: 0x0110, tipo: TIPO.ASCII, valores: 'Modelo XY-1000' },
    { tag: 0x0112, tipo: TIPO.SHORT, valores: [orientacao] },
    { tag: 0x0132, tipo: TIPO.ASCII, valores: '2026:01:15 14:32:10' },
    { tag: 0xa431, tipo: TIPO.ASCII, valores: 'SN-0123456789' },
  ]

  if (!comGps) {
    const { buffer } = montarIfd(entradasIfd0, 8)
    return montarApp1Exif(buffer)
  }

  // Duas passagens: a primeira para medir, a segunda com o ponteiro correto.
  const medida = montarIfd([...entradasIfd0, { tag: 0x8825, tipo: TIPO.LONG, valores: [0] }], 8)
  const deslocamentoGps = medida.fim

  const gps = montarIfd(
    [
      { tag: 0x0001, tipo: TIPO.ASCII, valores: 'N' },
      // 38 graus, 43 minutos, 12 segundos
      { tag: 0x0002, tipo: TIPO.RATIONAL, valores: [38, 1, 43, 1, 12, 1] },
      { tag: 0x0003, tipo: TIPO.ASCII, valores: 'W' },
      { tag: 0x0004, tipo: TIPO.RATIONAL, valores: [9, 1, 8, 1, 24, 1] },
    ],
    deslocamentoGps,
  )

  const ifd0 = montarIfd(
    [...entradasIfd0, { tag: 0x8825, tipo: TIPO.LONG, valores: [deslocamentoGps] }],
    8,
  )

  return montarApp1Exif(Buffer.concat([ifd0.buffer, gps.buffer]))
}

function montarApp1Exif(corpoTiff) {
  const tiff = Buffer.concat([Buffer.from('MM\0*', 'latin1'), u32be(8), corpoTiff])
  return segmento(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]))
}

// -------------------------------------------------------------------- XMP

/** XMP num APP1 com o namespace da Adobe. Inclui um campo de autor. */
export function segmentoXmp({ autor = 'Autor de Teste', local = 'Lisboa' } = {}) {
  const xml =
    `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>` +
    `<x:xmpmeta xmlns:x="adobe:ns:meta/">` +
    `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">` +
    `<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" ` +
    `xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/">` +
    `<dc:creator><rdf:Seq><rdf:li>${autor}</rdf:li></rdf:Seq></dc:creator>` +
    `<photoshop:City>${local}</photoshop:City>` +
    `</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`

  return segmento(
    0xe1,
    Buffer.concat([Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'latin1'), Buffer.from(xml, 'utf8')]),
  )
}

// ------------------------------------------------------------------- IPTC

/** Um dataset IPTC do registo 2: marcador, registo, numero, tamanho, dados. */
function datasetIptc(numero, texto) {
  const dados = Buffer.from(texto, 'latin1')
  return Buffer.concat([Buffer.from([0x1c, 0x02, numero]), u16be(dados.length), dados])
}

/** IPTC num APP13, dentro de um bloco 8BIM do Photoshop. */
export function segmentoIptc({ autor = 'Autor IPTC', legenda = 'Legenda de teste' } = {}) {
  const datasets = Buffer.concat([
    datasetIptc(0x50, autor), // By-line
    datasetIptc(0x78, legenda), // Caption
    datasetIptc(0x5a, 'Lisboa'), // City
  ])

  const bloco = Buffer.concat([
    Buffer.from('8BIM', 'latin1'),
    u16be(0x0404), // IPTC-NAA
    Buffer.from([0x00, 0x00]), // nome vazio, ja alinhado
    u32be(datasets.length),
    datasets,
    datasets.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0),
  ])

  return segmento(
    0xed,
    Buffer.concat([Buffer.from('Photoshop 3.0\0', 'latin1'), bloco]),
  )
}

// -------------------------------------------------------------------- ICC

/** Um perfil ICC que caiba num unico APP2. Chega para perfis pequenos. */
export function segmentoIcc(perfil) {
  return segmento(
    0xe2,
    Buffer.concat([
      Buffer.from('ICC_PROFILE\0', 'latin1'),
      Buffer.from([1, 1]), // sequencia 1 de 1
      perfil,
    ]),
  )
}
