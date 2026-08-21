import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

import './globals.css'

export const metadata: Metadata = {
  title: 'Conversor de Imagens',
  description:
    'Otimize e converta imagens no seu dispositivo. Os ficheiros não são enviados para servidores.',
  // Sem indexacao enquanto o produto nao estiver estavel. CLAUDE.md, seccao 25.
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Nunca bloquear o zoom: e um requisito de acessibilidade.
  maximumScale: 5,
}

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="pt-PT">
      <body>{children}</body>
    </html>
  )
}
