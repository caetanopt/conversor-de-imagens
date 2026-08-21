import { describe, expect, it } from 'vitest'

import {
  criarJob,
  destinoSugerido,
  estadoInicial,
  jobsReducer,
  opcoesParaFormato,
  opcoesPorDefeito,
} from '@/features/converter/state/jobsReducer'
import type { ConversionResult, ImageInspection } from '@/features/converter/types'

function ficheiro(nome = 'foto.jpg', tamanho = 1000): File {
  return new File([new Uint8Array(tamanho)], nome, { type: 'image/jpeg' })
}

function comJob(nome = 'foto.jpg') {
  const job = criarJob(ficheiro(nome), 'jpeg', 'webp')
  return { job, estado: jobsReducer(estadoInicial, { type: 'adicionar', job }) }
}

const inspecao: ImageInspection = {
  formatId: 'jpeg',
  magickFormat: 'JPEG',
  width: 1200,
  height: 800,
  frameCount: 1,
  hasAlpha: false,
}

const resultado: ConversionResult = {
  blob: new Blob([new Uint8Array(400)]),
  size: 400,
  width: 1200,
  height: 800,
  formatId: 'webp',
  durationMs: 120,
  decodeMs: 40,
  encodeMs: 80,
  profilesKept: [],
}

describe('criarJob', () => {
  it('gera um id que nao e o nome do ficheiro', () => {
    const job = criarJob(ficheiro('foto.jpg'), 'jpeg', 'webp')
    expect(job.id).not.toBe('foto.jpg')
    expect(job.id).not.toContain('foto')
    expect(job.id.length).toBeGreaterThan(10)
  })

  it('gera ids diferentes para o mesmo nome de ficheiro', () => {
    const a = criarJob(ficheiro('igual.jpg'), 'jpeg', 'webp')
    const b = criarJob(ficheiro('igual.jpg'), 'jpeg', 'webp')
    expect(a.id).not.toBe(b.id)
  })

  it('comeca pronto, sem resultado e sem erro', () => {
    const job = criarJob(ficheiro(), 'jpeg', 'webp')
    expect(job.status).toBe('ready')
    expect(job.result).toBeNull()
    expect(job.error).toBeNull()
  })

  it('preserva a cor e remove o resto dos metadados por defeito', () => {
    const job = criarJob(ficheiro(), 'jpeg', 'webp')
    // Nao e 'remover': sem o perfil de cor, uma imagem AdobeRGB muda de
    // aspeto. Nao e 'manter': o GPS e o numero de serie tem de sair.
    expect(job.options.metadata).toBe('preservar-cor')
    expect(job.options.autoOrient).toBe(true)
  })
})

describe('destinoSugerido', () => {
  it('sugere WebP para a maioria dos formatos', () => {
    expect(destinoSugerido('jpeg')).toBe('webp')
    expect(destinoSugerido('png')).toBe('webp')
  })

  it('sugere JPG quando a origem ja e WebP', () => {
    expect(destinoSugerido('webp')).toBe('jpeg')
  })

  it('lida com origem desconhecida', () => {
    expect(destinoSugerido(null)).toBe('webp')
  })
})

describe('jobsReducer', () => {
  it('adiciona e remove trabalhos', () => {
    const { job, estado } = comJob()
    expect(estado.jobs).toHaveLength(1)
    expect(jobsReducer(estado, { type: 'remover', id: job.id }).jobs).toHaveLength(0)
  })

  it('ignora acoes para ids desconhecidos sem criar um objeto novo', () => {
    const { estado } = comJob()
    const depois = jobsReducer(estado, { type: 'inspecao', id: 'inexistente', inspection: inspecao })
    // Mesma referencia: evita renders desnecessarios.
    expect(depois).toBe(estado)
  })

  it('guarda a inspecao e prefere o formato lido pelo motor', () => {
    const { job, estado } = comJob()
    const depois = jobsReducer(estado, {
      type: 'inspecao',
      id: job.id,
      inspection: { ...inspecao, formatId: 'png' },
    })
    expect(depois.jobs[0]?.inspection?.width).toBe(1200)
    expect(depois.jobs[0]?.sourceFormat).toBe('png')
  })

  it('mantem o formato da assinatura quando o motor nao o identifica', () => {
    const { job, estado } = comJob()
    const depois = jobsReducer(estado, {
      type: 'inspecao',
      id: job.id,
      inspection: { ...inspecao, formatId: null },
    })
    expect(depois.jobs[0]?.sourceFormat).toBe('jpeg')
  })

  it('limpa o erro anterior ao voltar a processar', () => {
    const { job, estado } = comJob()
    const comErro = jobsReducer(estado, {
      type: 'erro',
      id: job.id,
      error: { kind: 'falha-de-conversao', message: 'falhou' },
    })
    expect(comErro.jobs[0]?.error).not.toBeNull()

    const aProcessar = jobsReducer(comErro, { type: 'estado', id: job.id, status: 'processing' })
    expect(aProcessar.jobs[0]?.error).toBeNull()
  })

  it('um resultado limpa o erro e marca concluido', () => {
    const { job, estado } = comJob()
    const depois = jobsReducer(estado, { type: 'resultado', id: job.id, result: resultado })
    expect(depois.jobs[0]?.status).toBe('done')
    expect(depois.jobs[0]?.result?.size).toBe(400)
    expect(depois.jobs[0]?.error).toBeNull()
  })

  it('um erro limpa o resultado, para nao ficar um download obsoleto', () => {
    const { job, estado } = comJob()
    const concluido = jobsReducer(estado, { type: 'resultado', id: job.id, result: resultado })
    const comErro = jobsReducer(concluido, {
      type: 'erro',
      id: job.id,
      error: { kind: 'sem-memoria', message: 'sem memoria' },
    })
    expect(comErro.jobs[0]?.result).toBeNull()
    expect(comErro.jobs[0]?.status).toBe('error')
  })

  it('mudar o formato de destino invalida o resultado anterior', () => {
    const { job, estado } = comJob()
    const concluido = jobsReducer(estado, { type: 'resultado', id: job.id, result: resultado })
    const outroFormato = jobsReducer(concluido, {
      type: 'formato-de-saida',
      id: job.id,
      outputFormat: 'png',
    })
    // Sem isto o utilizador descarregaria um WebP a pensar que era um PNG.
    expect(outroFormato.jobs[0]?.result).toBeNull()
    expect(outroFormato.jobs[0]?.status).toBe('ready')
    expect(outroFormato.jobs[0]?.options.outputFormat).toBe('png')
  })

  it('mudar para um formato sem perda apaga a qualidade', () => {
    const { job, estado } = comJob()
    const paraPng = jobsReducer(estado, {
      type: 'formato-de-saida',
      id: job.id,
      outputFormat: 'png',
    })
    expect(paraPng.jobs[0]?.options.quality).toBeNull()
  })

  it('mudar de PNG para JPG devolve uma qualidade do preset', () => {
    const { job, estado } = comJob()
    const paraPng = jobsReducer(estado, { type: 'formato-de-saida', id: job.id, outputFormat: 'png' })
    const paraJpeg = jobsReducer(paraPng, {
      type: 'formato-de-saida',
      id: job.id,
      outputFormat: 'jpeg',
    })
    expect(paraJpeg.jobs[0]?.options.quality).toBe(82)
  })

  it('ajustar a qualidade a mao desliga o preset', () => {
    const { job, estado } = comJob()
    const depois = jobsReducer(estado, { type: 'qualidade', id: job.id, quality: 61 })
    expect(depois.jobs[0]?.options.quality).toBe(61)
    expect(depois.jobs[0]?.options.preset).toBeNull()
  })

  it('escolher um preset recalcula a qualidade para o formato atual', () => {
    const { job, estado } = comJob()
    const menor = jobsReducer(estado, { type: 'preset', id: job.id, preset: 'menor' })
    expect(menor.jobs[0]?.options.preset).toBe('menor')
    expect(menor.jobs[0]?.options.quality).toBe(65)

    const alta = jobsReducer(menor, { type: 'preset', id: job.id, preset: 'alta' })
    expect(alta.jobs[0]?.options.quality).toBe(90)
  })

  it('acumula avisos em vez de os substituir', () => {
    const { job, estado } = comJob()
    const um = jobsReducer(estado, { type: 'avisos', id: job.id, warnings: ['a'] })
    const dois = jobsReducer(um, { type: 'avisos', id: job.id, warnings: ['b'] })
    expect(dois.jobs[0]?.warnings).toEqual(['a', 'b'])
  })

  describe('redimensionamento', () => {
    it('define o resize e invalida o resultado anterior', () => {
      const { job, estado } = comJob()
      const concluido = jobsReducer(estado, { type: 'resultado', id: job.id, result: resultado })

      const comResize = jobsReducer(concluido, {
        type: 'resize',
        id: job.id,
        resize: { width: 600, height: null, preserveAspectRatio: true, allowUpscale: false },
      })

      expect(comResize.jobs[0]?.options.resize?.width).toBe(600)
      // Sem isto, o utilizador descarregaria a imagem nas dimensoes antigas.
      expect(comResize.jobs[0]?.result).toBeNull()
      expect(comResize.jobs[0]?.status).toBe('ready')
    })

    it('desligar o resize volta a null e nao a um objeto vazio', () => {
      const { job, estado } = comJob()
      const ligado = jobsReducer(estado, {
        type: 'resize',
        id: job.id,
        resize: { width: 600, height: null, preserveAspectRatio: true, allowUpscale: false },
      })
      const desligado = jobsReducer(ligado, { type: 'resize', id: job.id, resize: null })
      expect(desligado.jobs[0]?.options.resize).toBeNull()
    })

    it('comeca sem resize', () => {
      expect(criarJob(ficheiro(), 'jpeg', 'webp').options.resize).toBeNull()
    })
  })

  describe('politica de metadados', () => {
    it('mudar a politica invalida o resultado anterior', () => {
      const { job, estado } = comJob()
      const concluido = jobsReducer(estado, { type: 'resultado', id: job.id, result: resultado })
      const mudada = jobsReducer(concluido, {
        type: 'metadados',
        id: job.id,
        metadata: 'remover',
      })
      expect(mudada.jobs[0]?.options.metadata).toBe('remover')
      expect(mudada.jobs[0]?.result).toBeNull()
    })
  })

  describe('modo de otimizacao', () => {
    it('passar a otimizar forca o destino para o formato de origem', () => {
      const { estado } = comJob()
      expect(estado.jobs[0]?.options.outputFormat).toBe('webp')

      const otimizar = jobsReducer(estado, { type: 'modo', mode: 'otimizar' })
      expect(otimizar.mode).toBe('otimizar')
      // A origem e JPEG, portanto otimizar produz JPEG.
      expect(otimizar.jobs[0]?.options.outputFormat).toBe('jpeg')
    })

    it('voltar a converter nao mexe no formato escolhido', () => {
      const { estado } = comJob()
      const otimizar = jobsReducer(estado, { type: 'modo', mode: 'otimizar' })
      const converter = jobsReducer(otimizar, { type: 'modo', mode: 'converter' })
      // Nao adivinhamos por ele: o formato fica onde estava.
      expect(converter.jobs[0]?.options.outputFormat).toBe('jpeg')
    })

    it('repetir o mesmo modo devolve o mesmo estado', () => {
      const { estado } = comJob()
      expect(jobsReducer(estado, { type: 'modo', mode: 'converter' })).toBe(estado)
    })

    it('otimizar invalida o resultado anterior quando o formato muda', () => {
      const { job, estado } = comJob()
      const concluido = jobsReducer(estado, { type: 'resultado', id: job.id, result: resultado })
      const otimizar = jobsReducer(concluido, { type: 'modo', mode: 'otimizar' })
      expect(otimizar.jobs[0]?.result).toBeNull()
    })
  })

  it('limpar remove todos os trabalhos e mantem o modo', () => {
    const { estado } = comJob()
    const comModo = jobsReducer(estado, { type: 'modo', mode: 'otimizar' })
    const limpo = jobsReducer(comModo, { type: 'limpar' })
    expect(limpo.jobs).toHaveLength(0)
    expect(limpo.mode).toBe('otimizar')
  })
})

describe('opcoesParaFormato', () => {
  it('desliga lossless num formato que nao o suporta', () => {
    const base = { ...opcoesPorDefeito('webp'), lossless: true }
    expect(opcoesParaFormato(base, 'jpeg').lossless).toBe(false)
  })

  it('mantem lossless num formato que o suporta', () => {
    const base = { ...opcoesPorDefeito('webp'), lossless: true }
    expect(opcoesParaFormato(base, 'png').lossless).toBe(true)
  })
})
