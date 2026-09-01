/**
 * O que aconteceu de facto ao fundo desta conversao.
 *
 * A remocao por limiar de cor falha de duas maneiras opostas, e nenhuma delas e
 * previsivel a partir das opcoes: com a tolerancia a mais o recorte apaga a
 * imagem toda, com a tolerancia a menos nao encontra fundo nenhum. Medido, na
 * mesma imagem de um objeto quase branco sobre branco: 2 % de tolerancia deixa
 * 20,5 % da imagem opaca, e 8 % deixa 0,0 %, ou seja um ficheiro vazio.
 *
 * O utilizador nao tem como adivinhar em que caso caiu. Esta funcao le a
 * percentagem que o motor mediu no resultado e traduz nos tres desfechos
 * possiveis, para a interface poder ser especifica em vez de dizer
 * "concluido" a um ficheiro em branco.
 *
 * Funcao pura, sem React, testavel sem montar componentes. Mesmo padrao de
 * frames.ts.
 */

export type DesfechoDoFundo = {
  readonly tipo: 'removido' | 'apagou-a-imagem' | 'nao-encontrou-fundo'
  /** Percentagem da imagem que ficou visivel, arredondada. */
  readonly restantePercent: number
  readonly mensagem: string
  /** O que fazer a seguir, quando ha algo concreto a sugerir. */
  readonly sugestao?: string
}

/**
 * Abaixo deste valor sobrou tao pouca imagem que o recorte comeu o objeto.
 *
 * 2 % e nao 0 %: o caso destrutivo medido da exactamente 0,0 %, mas uma imagem
 * com uma nesga de objeto a sobreviver e igualmente inutil, e um limiar
 * exactamente em zero deixava-a passar como sucesso.
 */
const LIMIAR_APAGOU = 2

/**
 * Acima deste valor nao foi removido fundo que se veja.
 *
 * 99 % e nao 100 %: a percentagem vem da media do canal alfa, portanto a
 * fronteira esfumada de um recorte legitimo nunca da exactamente 100. Medido
 * num fundo fotografico a tolerancia 2 %: 100,0 % restante, ou seja nada
 * aconteceu.
 */
const LIMIAR_NAO_ENCONTROU = 99

/** Devolve null quando a remocao de fundo nao foi pedida: nao ha nada a dizer. */
export function avaliarFundo(backgroundKeptPercent: number | null): DesfechoDoFundo | null {
  if (backgroundKeptPercent === null) return null

  const restantePercent = Math.round(backgroundKeptPercent)

  if (backgroundKeptPercent < LIMIAR_APAGOU) {
    return {
      tipo: 'apagou-a-imagem',
      restantePercent,
      mensagem: 'O recorte removeu a imagem quase toda.',
      sugestao:
        'A cor do objeto é demasiado próxima da cor do fundo para esta tolerância. Escolha "Cor exata" e converta outra vez.',
    }
  }

  if (backgroundKeptPercent > LIMIAR_NAO_ENCONTROU) {
    return {
      tipo: 'nao-encontrou-fundo',
      restantePercent,
      mensagem: 'Não foi removido fundo nenhum.',
      sugestao:
        'Os cantos da imagem não têm uma cor uniforme. Experimente uma variação de cor maior, ou confirme que o fundo é liso.',
    }
  }

  return {
    tipo: 'removido',
    restantePercent,
    mensagem: `Fundo removido. Ficaram visíveis ${restantePercent} % da imagem.`,
  }
}
