/**
 * Regiao viva para mudancas de estado importantes.
 *
 * Sem isto, um utilizador de leitor de ecra nao sabe que a conversao
 * terminou: a alteracao acontece longe do foco. CLAUDE.md, seccao 20.7.
 */
type Props = { readonly mensagem: string }

export function LiveRegion({ mensagem }: Props) {
  return (
    <div className="visualmente-oculto" role="status" aria-live="polite" aria-atomic="true">
      {mensagem}
    </div>
  )
}
