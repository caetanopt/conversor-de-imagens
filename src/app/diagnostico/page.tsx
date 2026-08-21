import type { Metadata } from 'next'

import { PainelDeDiagnostico } from '@/features/diagnostico/PainelDeDiagnostico'

/**
 * Pagina interna de validacao.
 *
 * Nao e parte do produto. Existe porque validar o motor em Safari, em iOS ou
 * em qualquer dispositivo que nao esteja na maquina de quem desenvolve exige
 * abrir uma pagina nesse dispositivo. Um teste automatizado nao substitui isso
 * quando o browser nao pode ser instalado.
 *
 * Fora do indice dos motores de busca e sem ligacoes a partir do produto.
 */
export const metadata: Metadata = {
  title: 'Diagnostico do motor',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <PainelDeDiagnostico />
}
