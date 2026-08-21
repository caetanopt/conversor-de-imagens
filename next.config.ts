import type { NextConfig } from 'next'

/**
 * `output: 'export'` e uma decisao de privacidade, nao de conveniencia.
 * Sem runtime de servidor nao existe forma de criar um endpoint de upload,
 * nem por engano. Ver docs/privacidade.md.
 */
const nextConfig: NextConfig = {
  output: 'export',
  reactStrictMode: true,
  images: { unoptimized: true },
}

export default nextConfig
