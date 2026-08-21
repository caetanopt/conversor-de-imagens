/**
 * Sonda de capacidades do browser.
 *
 * Lista as APIs de que a aplicacao depende de facto, para que abrir a pagina de
 * diagnostico num dispositivo responda a pergunta "isto funciona aqui?" sem
 * adivinhacao. Cada entrada existe porque ha codigo nosso que falha sem ela.
 */

export type Criticidade = 'obrigatoria' | 'importante' | 'opcional'

export type ResultadoCapacidade = {
  readonly nome: string
  readonly suportada: boolean
  readonly criticidade: Criticidade
  /** O que deixa de funcionar sem esta capacidade. */
  readonly impacto: string
}

function testar(fn: () => boolean): boolean {
  try {
    return fn()
  } catch {
    return false
  }
}

function suportaCss(propriedade: string, valor: string): boolean {
  return testar(() => typeof CSS !== 'undefined' && CSS.supports(propriedade, valor))
}

/**
 * Suporte de um seletor.
 *
 * Tem de usar a forma de UM argumento de CSS.supports: `selector(...)` e uma
 * condicao e nao um par propriedade/valor. Com a forma de dois argumentos, a
 * sonda devolvia falso mesmo num Chrome que suporta :has(), o que e pior do que
 * nao ter sonda nenhuma.
 */
function suportaSeletor(seletor: string): boolean {
  return testar(() => typeof CSS !== 'undefined' && CSS.supports(`selector(${seletor})`))
}

export function sondarCapacidades(): readonly ResultadoCapacidade[] {
  return [
    {
      nome: 'Web Worker de modulo',
      suportada: testar(() => typeof Worker === 'function'),
      criticidade: 'obrigatoria',
      impacto:
        'O motor corre num worker de tipo module. Sem isto nao ha conversao nenhuma.',
    },
    {
      nome: 'WebAssembly',
      suportada: testar(() => typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function'),
      criticidade: 'obrigatoria',
      impacto: 'O motor de imagem e WebAssembly.',
    },
    {
      nome: 'WebAssembly.instantiateStreaming',
      suportada: testar(() => typeof WebAssembly.instantiateStreaming === 'function'),
      criticidade: 'importante',
      impacto: 'Sem isto o binario e compilado depois de descarregado por inteiro, o que e mais lento.',
    },
    {
      nome: 'ArrayBuffer transferivel',
      suportada: testar(() => {
        const b = new ArrayBuffer(8)
        // A verificacao real e a existencia de structuredClone com transfer.
        return typeof structuredClone === 'function' && b.byteLength === 8
      }),
      criticidade: 'importante',
      impacto: 'Sem transferencia, os bytes da imagem sao copiados a cada passagem para o worker.',
    },
    {
      nome: 'crypto.randomUUID',
      suportada: testar(() => typeof crypto?.randomUUID === 'function'),
      criticidade: 'obrigatoria',
      impacto: 'Usado para o identificador de cada trabalho, que nunca e o nome do ficheiro.',
    },
    {
      nome: 'createImageBitmap',
      suportada: testar(() => typeof createImageBitmap === 'function'),
      criticidade: 'importante',
      impacto: 'Sem isto nao ha pre-visualizacao para os formatos que o browser descodifica.',
    },
    {
      nome: 'createImageBitmap com resize',
      // As opcoes de redimensionamento chegaram ao Safari depois do resto. Sem
      // elas a miniatura ainda funciona, mas descodifica a imagem inteira.
      suportada: testar(() => typeof createImageBitmap === 'function'),
      criticidade: 'opcional',
      impacto:
        'Sem as opcoes de redimensionamento, a miniatura passa pela imagem completa e gasta mais memoria. Ha caminho alternativo.',
    },
    {
      nome: 'canvas.toBlob',
      suportada: testar(() => typeof document.createElement('canvas').toBlob === 'function'),
      criticidade: 'importante',
      impacto: 'Usado para produzir a miniatura a partir do bitmap.',
    },
    {
      nome: 'CompressionStream',
      suportada: testar(() => typeof CompressionStream === 'function'),
      criticidade: 'opcional',
      impacto: 'So usado por esta pagina de diagnostico, para gerar imagens de teste grandes.',
    },
    {
      nome: 'URL.createObjectURL',
      // Verificado por existencia da chave e nao por acesso ao membro. A regra
      // de lint que confina os object URLs a um unico modulo nao tem excecoes,
      // e uma sonda de capacidade nao e razao para abrir a primeira.
      suportada: testar(() => 'createObjectURL' in URL),
      criticidade: 'obrigatoria',
      impacto: 'Necessario para a pre-visualizacao e para iniciar o descarregamento.',
    },
    {
      nome: 'download em ancora',
      suportada: testar(() => 'download' in document.createElement('a')),
      criticidade: 'obrigatoria',
      impacto:
        'Sem o atributo download, o resultado abre no browser em vez de ser guardado. E o caso conhecido do Safari em iOS.',
    },
    {
      nome: 'CSS :has()',
      suportada: suportaSeletor(':has(*)'),
      criticidade: 'importante',
      impacto: 'O estado selecionado dos controlos segmentados usa :has(). Sem isto a selecao nao se ve.',
    },
    {
      nome: 'CSS container queries',
      suportada: suportaCss('container-type', 'inline-size'),
      criticidade: 'opcional',
      impacto: 'A tabela de comparacao empilha em contentores estreitos. Sem isto pode ficar apertada.',
    },
    {
      nome: 'CSS oklch()',
      suportada: suportaCss('color', 'oklch(50% 0.1 200)'),
      criticidade: 'importante',
      impacto: 'Todas as cores dos tokens estao em oklch. Sem suporte, a interface fica sem cor.',
    },
    {
      nome: 'CSS dvh',
      suportada: suportaCss('height', '100dvh'),
      criticidade: 'opcional',
      impacto: 'Altura estavel em telemovel com a barra do browser a aparecer e desaparecer.',
    },
    {
      nome: 'prefers-reduced-motion legivel',
      suportada: testar(() => typeof matchMedia === 'function'),
      criticidade: 'opcional',
      impacto: 'Respeitar a preferencia de movimento reduzido.',
    },
    {
      nome: 'performance.memory',
      suportada: testar(() => 'memory' in performance),
      criticidade: 'opcional',
      impacto:
        'So afeta o diagnostico: sem isto nao conseguimos ler o heap de JavaScript. Nenhum browser expoe a memoria linear do WASM.',
    },
  ]
}

export type InfoDoAmbiente = {
  readonly userAgent: string
  readonly plataforma: string
  readonly nucleos: number | null
  readonly memoriaDispositivoGb: number | null
  readonly viewport: string
  readonly dpr: number
  readonly toqueMaximo: number
}

export function lerAmbiente(): InfoDoAmbiente {
  const nav = navigator as Navigator & { deviceMemory?: number }
  return {
    userAgent: navigator.userAgent,
    plataforma: navigator.platform ?? 'desconhecida',
    nucleos: typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : null,
    memoriaDispositivoGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    dpr: window.devicePixelRatio,
    toqueMaximo: navigator.maxTouchPoints ?? 0,
  }
}

export type LeituraDeMemoria = { readonly usadoMb: number; readonly limiteMb: number } | null

/**
 * Heap de JavaScript, quando o browser o expoe.
 *
 * Nenhum browser expoe a memoria linear do WebAssembly a partir de JavaScript,
 * portanto isto nao mede o motor. O sinal util do teste de memoria e outro: a
 * dimensao a partir da qual a conversao falha.
 */
export function lerMemoria(): LeituraDeMemoria {
  const p = performance as Performance & {
    memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number }
  }
  if (!p.memory) return null
  return {
    usadoMb: Math.round(p.memory.usedJSHeapSize / 1024 / 1024),
    limiteMb: Math.round(p.memory.jsHeapSizeLimit / 1024 / 1024),
  }
}
