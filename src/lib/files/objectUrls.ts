/**
 * Ciclo de vida de object URLs, num unico sitio.
 *
 * Uma regra de ESLint proibe chamadas diretas a createObjectURL e
 * revokeObjectURL em qualquer outro ficheiro do projeto. Isto existe para
 * duas coisas:
 *
 *  1. garantir que cada URL criado tem um revoke correspondente, porque um
 *     object URL nao revogado mantem os bytes da imagem vivos em memoria
 *     durante toda a sessao;
 *  2. permitir que um teste verifique que nao ha URLs pendentes no fim de um
 *     fluxo completo, em vez de confiarmos em inspecao visual do codigo.
 */
const ativos = new Set<string>()

export function criarObjectUrl(origem: Blob): string {
  const url = URL.createObjectURL(origem)
  ativos.add(url)
  return url
}

export function revogarObjectUrl(url: string | null | undefined): void {
  if (!url) return
  if (!ativos.has(url)) return
  URL.revokeObjectURL(url)
  ativos.delete(url)
}

/** Numero de URLs por revogar. Deve ser 0 depois de limpar um trabalho. */
export function contarObjectUrlsAtivos(): number {
  return ativos.size
}

/** Rede de seguranca. Usado ao desmontar a area de trabalho. */
export function revogarTodosOsObjectUrls(): void {
  for (const url of ativos) URL.revokeObjectURL(url)
  ativos.clear()
}
