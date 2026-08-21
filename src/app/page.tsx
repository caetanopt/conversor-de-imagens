import { AppHeader } from '@/components/brand/AppHeader'
import { ConverterWorkbench } from '@/features/converter/components/ConverterWorkbench'

/**
 * A ferramenta e a pagina. Nao existe conteudo de marketing antes dela.
 */
export default function Page() {
  return (
    <>
      <AppHeader />
      <ConverterWorkbench />
    </>
  )
}
