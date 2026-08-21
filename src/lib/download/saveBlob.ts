/**
 * Descarregar um resultado.
 *
 * O object URL e revogado depois de o browser iniciar o download. Sem isto,
 * os bytes da imagem ficariam vivos em memoria durante o resto da sessao.
 */
import { criarObjectUrl, revogarObjectUrl } from '@/lib/files/objectUrls'

export function descarregarBlob(blob: Blob, nomeDoFicheiro: string): void {
  const url = criarObjectUrl(blob)
  const ancora = document.createElement('a')
  ancora.href = url
  ancora.download = nomeDoFicheiro
  ancora.rel = 'noopener'
  ancora.style.display = 'none'

  document.body.appendChild(ancora)
  ancora.click()
  ancora.remove()

  // O browser ja capturou o URL neste ponto. Revogar de imediato cancelaria o
  // download em alguns browsers, por isso libertamos no tick seguinte.
  setTimeout(() => revogarObjectUrl(url), 0)
}
