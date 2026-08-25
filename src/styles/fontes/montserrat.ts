/**
 * Montserrat, a tipografia da marca.
 *
 * O manual de identidade, pagina 16, fixa Montserrat nos pesos Bold, Regular e
 * Light, e Medium para o claim. Aptos aparece no manual apenas para assinaturas
 * de email, portanto nao entra na aplicacao.
 *
 * O ficheiro esta no repositorio, e nao vem do Google Fonts em tempo de
 * execucao nem de build, por duas razoes:
 *
 *  1. Um pedido a fonts.gstatic.com acrescentaria um terceiro ao inventario de
 *     pedidos de rede documentado em docs/privacidade.md. A aplicacao afirma
 *     que nada sai do dispositivo; quanto menor for a lista de origens, mais
 *     simples e verificar essa afirmacao.
 *  2. O build deixa de precisar de rede, o que o torna reproduzivel.
 *
 * E a versao variavel do subconjunto latino, 37 kB, que cobre os pesos 100 a
 * 900 num unico ficheiro. O subconjunto latino inclui todos os caracteres
 * acentuados do portugues.
 */
import localFont from 'next/font/local'

export const montserrat = localFont({
  src: './montserrat-latin-variable.woff2',
  // Ficheiro variavel: um so recurso serve toda a escala de pesos.
  weight: '100 900',
  style: 'normal',
  // `swap` mostra texto imediatamente com a fonte de sistema e troca quando a
  // Montserrat chega. O alternativo, `block`, deixaria o texto invisivel.
  display: 'swap',
  variable: '--font-montserrat',
  // Metricas proximas para reduzir o salto de layout na troca.
  adjustFontFallback: 'Arial',
  fallback: [
    'ui-sans-serif',
    'system-ui',
    '-apple-system',
    'Segoe UI',
    'Roboto',
    'Helvetica',
    'Arial',
    'sans-serif',
  ],
})
