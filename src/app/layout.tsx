import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

import { SCRIPT_ANTES_DO_PAINT } from '@/lib/tema/tema'
import { montserrat } from '@/styles/fontes/montserrat'
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
    // A classe da fonte tem de ficar no <html>: e ai que os tokens de
    // tipografia, declarados em :root, leem --font-montserrat.
    <html lang="pt-PT" className={montserrat.variable}>
      <head>
        {/*
          Aplica o tema guardado antes do primeiro paint. Sem isto, quem
          escolheu um tema diferente do sistema veria a paleta errada durante um
          instante a cada carregamento. Tem de ser sincrono e inline.
        */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_ANTES_DO_PAINT }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
