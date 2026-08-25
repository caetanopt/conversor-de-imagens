/**
 * Preferencia de tema.
 *
 * ESTE E O UNICO FICHEIRO DA APLICACAO QUE TOCA EM localStorage. Uma regra de
 * lint proibe-o em todos os outros, e a excecao esta declarada explicitamente
 * na configuracao.
 *
 * A regra de privacidade do CLAUDE.md, seccao 2.4, proibe guardar imagens em
 * localStorage. O que fica guardado aqui e uma palavra de entre tres valores
 * possiveis, escolhida pelo utilizador ao carregar num botao. Nao e uma imagem,
 * nao e metadado de uma imagem, e nao permite inferir nada sobre os ficheiros
 * que passaram pela aplicacao.
 *
 * A alternativa era nao guardar nada, e nesse caso o tema escolhido perdia-se a
 * cada recarregamento, o que torna o controlo inutil. Um teste end to end
 * verifica que esta e a UNICA chave guardada e que o valor e um dos tres
 * esperados, o que e uma garantia mais precisa do que contar zero chaves.
 */

export type Tema = 'sistema' | 'claro' | 'escuro'

export const TEMAS: readonly Tema[] = ['sistema', 'claro', 'escuro']

/** Nome da chave. Um prefixo evita colisao se a origem for partilhada. */
export const CHAVE_DO_TEMA = 'conversor:tema'

/** Atributo no elemento raiz. O CSS de tokens reage a ele. */
export const ATRIBUTO_DO_TEMA = 'data-tema'

export const TEMA_POR_DEFEITO: Tema = 'sistema'

export function eTema(valor: unknown): valor is Tema {
  return typeof valor === 'string' && (TEMAS as readonly string[]).includes(valor)
}

/** Proximo tema no ciclo do botao. */
export function proximoTema(atual: Tema): Tema {
  const i = TEMAS.indexOf(atual)
  return TEMAS[(i + 1) % TEMAS.length]!
}

export const ROTULOS: Record<Tema, string> = {
  sistema: 'Automático',
  claro: 'Claro',
  escuro: 'Escuro',
}

/**
 * A mesma escolha, em forma curta, para o cabecalho estreito.
 *
 * A 360 px o cabecalho tem a marca, este botao e o indicador de privacidade a
 * competir por 336 px uteis, e 'Automático' nao cabe: empurrava a pagina para
 * fora do ecra. Apenas esse valor encurta; os outros dois ja sao curtos.
 *
 * O nome acessivel do botao usa sempre a forma longa, portanto quem ouve o
 * botao ouve a palavra inteira em qualquer largura.
 */
export const ROTULOS_CURTOS: Record<Tema, string> = {
  sistema: 'Auto',
  claro: 'Claro',
  escuro: 'Escuro',
}

/**
 * Le a preferencia guardada.
 *
 * Qualquer falha devolve o valor por defeito: um browser em modo privado pode
 * lancar ao acessar localStorage, e nesse caso a aplicacao segue o sistema em
 * vez de falhar.
 */
export function lerTemaGuardado(): Tema {
  try {
    const valor = localStorage.getItem(CHAVE_DO_TEMA)
    return eTema(valor) ? valor : TEMA_POR_DEFEITO
  } catch {
    return TEMA_POR_DEFEITO
  }
}

export function guardarTema(tema: Tema): void {
  try {
    // 'sistema' e a ausencia de escolha, portanto nao deixa nada guardado.
    if (tema === TEMA_POR_DEFEITO) localStorage.removeItem(CHAVE_DO_TEMA)
    else localStorage.setItem(CHAVE_DO_TEMA, tema)
  } catch {
    // Sem persistencia, a escolha vale para esta sessao. Nao e motivo de erro.
  }
}

/**
 * Aplica o tema ao documento.
 *
 * 'sistema' remove o atributo, e nao o poe a 'sistema': e a ausencia do
 * atributo que devolve a decisao ao `prefers-color-scheme` do CSS.
 */
export function aplicarTema(tema: Tema, raiz: HTMLElement): void {
  if (tema === TEMA_POR_DEFEITO) raiz.removeAttribute(ATRIBUTO_DO_TEMA)
  else raiz.setAttribute(ATRIBUTO_DO_TEMA, tema)
}

/**
 * Script aplicado antes do primeiro paint.
 *
 * Sem isto, quem escolheu um tema diferente do sistema ve a paleta errada
 * durante um instante a cada carregamento. Tem de ser sincrono e no `head`,
 * antes de o corpo ser pintado, o que obriga a ser inline.
 *
 * Nota para quem acrescentar uma Content Security Policy: este script precisa
 * de hash ou nonce, senao o tema volta a piscar.
 */
export const SCRIPT_ANTES_DO_PAINT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  CHAVE_DO_TEMA,
)});if(t==='claro'||t==='escuro'){document.documentElement.setAttribute(${JSON.stringify(
  ATRIBUTO_DO_TEMA,
)},t)}}catch(e){}})()`
