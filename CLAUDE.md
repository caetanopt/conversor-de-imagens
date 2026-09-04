# CLAUDE.md

## 1. Objetivo do projeto

Criar uma plataforma web de otimização e conversão de imagens, rápida, privada e visualmente diferenciada.

A aplicação deve permitir ao utilizador:

1. Selecionar ou arrastar uma ou várias imagens.
2. Otimizar o tamanho do ficheiro.
3. Converter a imagem para outro formato de imagem suportado.
4. Ajustar opções relevantes para o formato de destino.
5. Comparar tamanho original e tamanho final.
6. Descarregar cada resultado individualmente ou todos os resultados de uma vez.

Nesta primeira fase não existe autenticação, conta de utilizador, base de dados, histórico, cloud storage ou qualquer funcionalidade que implique guardar imagens.

O processamento das imagens deve acontecer no dispositivo do utilizador, preferencialmente no browser através de WebAssembly e Web Workers.

As imagens não podem ser enviadas para servidores da aplicação ou de terceiros para serem convertidas.

## 2. Regra principal de privacidade

A privacidade é um requisito de arquitetura, não apenas uma mensagem de marketing.

### Regras obrigatórias

1. Nunca enviar bytes da imagem para uma API de processamento.
2. Não criar endpoints de upload.
3. Não guardar imagens em base de dados, storage, bucket, CDN ou sistema de ficheiros remoto.
4. Não guardar imagens em localStorage, sessionStorage, IndexedDB ou Cache Storage.
5. Não incluir imagens, previews, nomes de ficheiros ou conteúdo EXIF em logs, analytics ou ferramentas de monitorização.
6. Usar `File`, `Blob`, `ArrayBuffer` e object URLs apenas enquanto forem necessários no browser.
7. Revogar object URLs assim que deixarem de ser necessários.
8. Libertar referências a buffers depois da conversão e quando o utilizador remover um ficheiro.
9. Se for criado um ZIP com vários resultados, gerar o ZIP localmente no browser.
10. Não adicionar integração com Google Drive, Dropbox, OneDrive ou URL remoto nesta fase.
11. Não implementar service workers que façam cache dos ficheiros do utilizador.
12. Qualquer futura ferramenta de analytics deve recolher apenas eventos anónimos e nunca dados que identifiquem o ficheiro processado.

A interface deve conseguir afirmar de forma verdadeira algo equivalente a:

> As imagens são processadas no seu dispositivo e não são enviadas para os nossos servidores.

Esta frase só pode ser mostrada se a implementação continuar a cumprir esta regra.

## 3. Referências de produto

Usar estes serviços apenas como referência funcional e de compreensão do mercado:

- https://cloudconvert.com/jpg-to-webp
- https://convertio.co/pt/jpg-webp/
- https://www.freeconvert.com/jpg-to-webp

Não copiar layouts, identidade visual, textos, ícones ou componentes destes sites.

### Elementos funcionais que vale a pena considerar

#### CloudConvert

- Seleção simples de ficheiro.
- Drag and drop.
- Escolha clara do formato de origem e destino.
- Controlo de resolução, qualidade e tamanho final.
- Fluxo com poucas distrações.

#### Convertio

- Conversão orientada a um par de formatos.
- Catálogo alargado de formatos.
- Drag and drop muito evidente.
- Fluxo simples entre seleção, conversão e download.
- Estrutura que permite criar páginas específicas por conversão.

#### FreeConvert

- Processamento em lote.
- Definições avançadas opcionais.
- Redimensionamento.
- Compressão sem perda quando o formato permite.
- Controlo de qualidade.
- Orientação automática com base em EXIF.
- Remoção de metadados.
- Possibilidade de aplicar as mesmas definições a vários ficheiros.

### Diferença fundamental da nossa solução

Os serviços de referência podem processar ficheiros em infraestrutura remota e depois eliminá-los.

A nossa primeira versão deve evitar esse modelo por completo.

A conversão deve ser local no browser. O ficheiro não deve sair do dispositivo do utilizador.

## 4. Âmbito da primeira versão

### Incluído

1. Conversão de imagem para imagem.
2. Otimização de imagens.
3. Conversão individual.
4. Conversão em lote.
5. Drag and drop.
6. Seleção através do sistema de ficheiros.
7. Preview local.
8. Escolha do formato de saída.
9. Qualidade de saída quando aplicável.
10. Compressão sem perda quando aplicável.
11. Redimensionamento opcional.
11.1. Corte com seleção interativa na pré-visualização, ao estilo da ferramenta
   do Photoshop: oito manípulos, arrastar para mover, véu na área excluída,
   grelha de terços, proporções predefinidas e campos numéricos. Os campos são
   também a via por teclado, que não é opcional. Ficam de fora o "excluir
   pixéis", que aqui não existe porque a conversão nunca toca no original, e o
   "corrigir", que é rotação. Ver `docs/medicoes.md`.
12. Preservar proporção por defeito.
13. Orientação automática.
14. Opção para remover metadados.
15. Opção para remover o fundo em imagens de fundo uniforme, por limiar de cor
    no dispositivo. Não é segmentação por IA: fotografia de produto, logótipo e
    captura de ecrã funcionam, uma pessoa num cenário não, e a interface tem de
    dizer isso em vez de prometer o que o método não faz. Ver `docs/medicoes.md`.
16. Mostrar tamanho antes e depois.
17. Mostrar percentagem de redução ou aumento.
18. Download individual.
19. Download de vários resultados num ZIP gerado localmente.
20. Interface responsiva.
21. Conteúdo e microcopy em Português de Portugal.

### Fora do âmbito nesta fase

1. Autenticação dentro da aplicação. Em agosto de 2026, a pedido do responsável
   do projeto, o acesso passou a ser restringido à equipa por autenticação no
   edge, à frente do site. Continua a não existir ecrã de login no produto,
   base de dados, ou segredos no repositório, e a aplicação continua a ser um
   export estático. Ver `docs/acesso.md`.
2. Registo.
3. Área pessoal.
4. Histórico de conversões.
5. Base de dados.
6. Upload para cloud.
7. Integrações com serviços externos de storage.
8. API pública de conversão.
9. Planos pagos.
10. Sistema de créditos.
11. Equipas.
12. Processamento de vídeo.
13. Processamento de áudio.
14. Conversão de documentos.
15. OCR.
16. Editor de imagem completo.
17. Ferramentas de IA generativa.

## 5. Formatos

O produto deve ser exclusivamente focado em imagem para imagem nesta fase.

Não mostrar formatos de documentos, áudio, vídeo ou arquivos apenas porque os sites de referência os suportam.

### Formatos prioritários para a primeira versão

Implementar e testar primeiro:

- JPG
- JPEG
- PNG
- WEBP
- AVIF
- GIF
- BMP
- TIFF
- TIF
- ICO
- JFIF

### Formatos a avaliar depois de validar o motor no browser

- HEIC
- HEIF
- JXL
- TGA
- PCX
- DDS
- PPM
- PGM
- EXR
- PSD
- SVG como formato de entrada para rasterização
- formatos RAW de câmaras, apenas se o motor realmente os suportar de forma estável no browser

### Regras para formatos

1. Não mostrar um formato na interface só porque um concorrente o mostra.
2. Um formato só pode aparecer se existir suporte real e testado para leitura ou escrita, conforme o caso.
3. Manter uma tabela central de capacidades.
4. Distinguir formatos que podem ser entrada, saída ou ambos.
5. Distinguir formatos com suporte de transparência.
6. Distinguir formatos com suporte de animação.
7. Distinguir formatos que permitem compressão sem perda.
8. Nunca eliminar animação silenciosamente. Se o motor não conseguir preservar os frames, informar o utilizador antes da conversão.
8.1. O mesmo vale para a transparência. Um destino sem canal alfa não pode
   receber um pedido de remoção de fundo em silêncio: a opção desliga-se e a
   interface explica porquê.
9. Não apresentar conversão de raster para SVG como verdadeira vetorização. Se essa funcionalidade não existir, não a oferecer.
10. Tratar JPG e JPEG como aliases do mesmo formato para UX, mantendo a extensão escolhida quando fizer sentido.

Criar algo semelhante a:

```ts
export type ImageFormatCapability = {
  id: string
  label: string
  extensions: string[]
  mimeTypes: string[]
  canDecode: boolean
  canEncode: boolean
  supportsAlpha: boolean
  supportsAnimation: boolean
  supportsLossless: boolean
  supportsQuality: boolean
  supportsResize: boolean
}
```

A lista apresentada na interface deve ser derivada desta configuração e não de strings espalhadas pelos componentes.

## 6. Motor de processamento

### Princípio

O motor deve funcionar no browser e estar isolado da camada de interface.

Criar uma abstração para permitir trocar ou adicionar codecs no futuro sem reescrever a aplicação.

Exemplo conceptual:

```ts
export interface ImageEngine {
  getCapabilities(): Promise<ImageFormatCapability[]>
  inspect(file: File): Promise<ImageInspection>
  convert(input: ArrayBuffer, options: ConversionOptions): Promise<ConversionResult>
  dispose(): Promise<void> | void
}
```

### Opção inicial recomendada

Começar por avaliar `@imagemagick/magick-wasm` como motor principal, porque permite usar ImageMagick no browser através de WebAssembly e suporta uma gama muito alargada de formatos sem chamar uma API de processamento.

Não acoplar a aplicação diretamente à biblioteca. Criar um adapter, por exemplo:

`src/lib/image-engine/magick/MagickImageEngine.ts`

Isto permite introduzir posteriormente codecs especializados para formatos web se os benchmarks mostrarem vantagem relevante.

### Estratégia futura de otimização

Depois do MVP estar funcional, avaliar codecs especializados baseados em Squoosh ou jSquash para JPEG, PNG, WebP e AVIF.

Só adicionar um segundo motor se existir melhoria mensurável em pelo menos um destes pontos:

- tamanho final
- qualidade visual
- velocidade
- consumo de memória
- tamanho do bundle

Não aumentar a complexidade apenas para ter mais bibliotecas.

## 7. Web Workers

Todo o processamento pesado deve acontecer fora da main thread.

Criar um worker dedicado para conversão e otimização.

Objetivos:

1. A interface não deve bloquear durante a conversão.
2. Deve ser possível mostrar progresso por ficheiro quando o motor o permitir.
3. Deve existir fila de trabalhos.
4. O utilizador deve conseguir cancelar trabalhos que ainda não terminaram.
5. Transferir `ArrayBuffer` entre threads quando possível, em vez de fazer cópias desnecessárias.
6. Limitar concorrência para não esgotar memória em conversões em lote.

Começar com uma concorrência conservadora baseada em `navigator.hardwareConcurrency`, com um limite máximo configurável.

## 8. Stack recomendada

### Aplicação

- Next.js com App Router, versão estável no momento de criação do projeto.
- React.
- TypeScript com modo strict.
- Aplicação orientada a componentes client-side na área do conversor.
- Geração estática sempre que possível para páginas institucionais e futuras landing pages de conversão.

### Estilos

- Tailwind CSS pode ser usado como motor de utilities.
- Não usar shadcn como identidade visual pronta.
- Não usar um design system externo como base visual principal.
- Criar componentes próprios.
- Definir tokens de marca através de CSS custom properties.

Exemplo:

```css
:root {
  --brand-primary: #000000;
  --brand-secondary: #ffffff;
  --surface: #ffffff;
  --surface-subtle: #f5f5f5;
  --text: #111111;
  --text-muted: #666666;
  --border: #d9d9d9;
  --radius-sm: 6px;
  --radius-md: 12px;
  --space-unit: 4px;
}
```

Estes valores são provisórios e devem ser substituídos depois de receber o manual de identidade da marca.

### Estado

Evitar uma store global pesada na primeira versão.

Preferir:

- React state
- reducer para a fila de ficheiros
- Context apenas se existir partilha real entre áreas distantes

Adicionar Zustand ou equivalente apenas se a complexidade justificar.

### Testes

- Vitest para lógica.
- Testing Library para componentes.
- Playwright para fluxos principais no browser.

## 9. Estrutura de projeto sugerida

```text
src/
  app/
    page.tsx
    layout.tsx
    globals.css
  components/
    brand/
    controls/
    feedback/
  features/
    converter/
      components/
      hooks/
      state/
      types/
  lib/
    image-engine/
      ImageEngine.ts
      capabilities.ts
      magick/
        MagickImageEngine.ts
    download/
    files/
    validation/
  workers/
    image.worker.ts
  config/
    formats.ts
    limits.ts
  styles/
    tokens.css
    typography.css
    motion.css
  tests/
```

Evitar pastas genéricas gigantes como `utils` ou `helpers` onde tudo acaba misturado.

## 10. Modelo de dados

Cada ficheiro deve ter estado independente.

Exemplo:

```ts
export type ConversionStatus =
  | 'ready'
  | 'processing'
  | 'done'
  | 'error'
  | 'cancelled'

export type ImageJob = {
  id: string
  file: File
  sourceFormat: string
  sourceSize: number
  width?: number
  height?: number
  previewUrl?: string
  outputFormat: string
  options: ConversionOptions
  status: ConversionStatus
  progress?: number
  result?: {
    blob: Blob
    size: number
    width?: number
    height?: number
  }
  error?: string
}
```

Nunca usar o nome do ficheiro como ID.

## 11. Opções de conversão

As opções devem ser contextuais ao formato selecionado.

Não mostrar controlos que não tenham efeito.

### Opções comuns

- formato de saída
- qualidade, quando aplicável
- largura
- altura
- preservar proporção
- não aumentar imagens pequenas por defeito
- orientação automática
- remover metadados
- remover fundo, apenas quando o formato de destino tem canal alfa
- corte, em pixéis da imagem de origem depois da orientação automática

### JPEG

Quando suportado pelo motor:

- qualidade
- progressivo
- remoção de metadata
- subsampling apenas numa secção avançada, se for relevante e compreensível

### PNG

Quando suportado:

- compressão sem perda
- nível ou esforço de compressão
- redução de paleta apenas como opção avançada

### WebP

Quando suportado:

- qualidade
- lossless
- esforço de compressão
- qualidade alpha, se o motor expuser essa opção de forma estável

### AVIF

Quando suportado:

- qualidade
- esforço ou velocidade
- modo lossless, se realmente suportado pelo encoder escolhido

### GIF

- preservar animação quando possível
- não destruir animação sem aviso
- não apresentar qualidade JPEG como se fosse aplicável a GIF

## 12. Otimização

O utilizador deve conseguir escolher entre três modos principais:

### Otimizar

Mantém o formato original, sempre que possível, e reduz o tamanho do ficheiro.

### Converter

Permite escolher outro formato e, opcionalmente, otimizar durante a conversão.

### Redimensionar

Mantém o formato original e altera as dimensões, por escala ou por corte. As
duas vias mudam quantos pixéis saem, por isso vivem no mesmo modo e não em dois
sítios distantes do painel.

Neste modo o interruptor do redimensionamento não aparece: seria um segundo
controlo com o mesmo nome do modo e o mesmo significado. O modo é o interruptor,
e os campos entram pré-enchidos com as dimensões da imagem para serem
imediatamente utilizáveis.

Sair do modo não desliga o redimensionamento escolhido. Desligá-lo seria perder
trabalho do utilizador sem ele pedir.

### Regra comum aos três

Não criar produtos separados. Devem ser modos do mesmo fluxo: o pipeline é um só,
e a diferença entre modos é apenas uma restrição no formato de destino
(`otimizar` e `redimensionar` impõem o formato de origem, `converter` deixa
escolher) e a intenção que fica em destaque.

### Presets iniciais

Criar três presets com nomes claros e sem linguagem vaga:

1. Qualidade alta
2. Equilibrado
3. Ficheiro mais pequeno

Os valores internos dependem do formato.

Mostrar sempre os controlos manuais para quem quiser ajustar.

## 13. Experiência de utilização

O produto deve parecer uma ferramenta profissional, não uma landing page genérica de SaaS.

### Direção de layout

Evitar o padrão habitual:

- grande hero centrado
- gradiente roxo ou azul
- ilustração abstrata
- três cartões de benefícios
- secção de testemunhos fictícios
- cartões com cantos demasiado arredondados em toda a interface
- glassmorphism
- brilho neon
- botão gigante com texto genérico
- ícones decorativos sem função

### Conceito recomendado

Pensar na aplicação como uma mesa de trabalho de imagem.

Antes de existirem ficheiros:

1. Cabeçalho compacto.
2. Marca à esquerda.
3. Indicador de privacidade discreto e visível.
4. Área de trabalho dominante para arrastar imagens.
5. Formato de destino acessível junto da área de entrada.
6. Pouco texto de marketing acima da dobra.

Depois de adicionar ficheiros:

1. Coluna ou rail de ficheiros à esquerda.
2. Preview principal no centro.
3. Painel de definições à direita.
4. Barra de ações persistente na parte inferior ou numa zona previsível.
5. Tamanho original e final sempre próximos da ação de descarregar.
6. Possibilidade de aplicar definições a todos os ficheiros.

No telemóvel:

1. Fila de ficheiros compacta no topo.
2. Preview.
3. Definições em painel expansível.
4. Ação principal fixa apenas se não tapar conteúdo importante.

O layout final terá de ser revisto quando o manual de identidade da marca for fornecido.

## 14. Manual de identidade da marca

O manual de identidade ainda não foi fornecido.

Até existir esse documento:

1. Não assumir cores finais.
2. Não escolher uma tipografia de marca definitiva.
3. Não criar logótipo.
4. Não inventar símbolos de marca.
5. Não usar gradientes como solução visual por defeito.
6. Não usar o visual típico de produtos gerados por IA.
7. Construir a interface com tokens para permitir substituição rápida de cor, tipografia, radius, spacing e motion.
8. Manter os componentes estruturalmente sólidos mas visualmente fáceis de adaptar.

Quando o manual for adicionado ao repositório, deverá ficar preferencialmente em:

`docs/brand/`

Antes de qualquer trabalho visual relevante, procurar primeiro por documentos nessa pasta e tratá-los como fonte principal para decisões de marca.

Se existir conflito entre este ficheiro e o manual da marca em matéria visual, o manual da marca prevalece.

As regras de privacidade, arquitetura e âmbito continuam a prevalecer, exceto se forem explicitamente alteradas pelo responsável do projeto.

## 15. Linguagem e Português de Portugal

Todo o conteúdo visível ao utilizador deve ser escrito em Português de Portugal.

Preferir termos como:

- ficheiro
- ficheiros
- selecionar
- arrastar
- largar
- descarregar
- definições
- qualidade
- tamanho
- largura
- altura
- imagem
- imagens
- remover
- conversão
- otimização
- processar

Evitar variantes brasileiras como:

- arquivo
- arquivos
- configurações quando `definições` for mais natural
- baixar
- soltar arquivo

### Tom

- claro
- direto
- confiante
- técnico apenas quando necessário
- sem frases artificiais
- sem exageros de marketing
- sem linguagem típica de assistente de IA

Não usar travessões longos como recurso estilístico na copy.

Não usar emojis no produto salvo indicação explícita da marca.

## 16. Microcopy base

Textos provisórios, sujeitos ao manual de marca.

### Estado inicial

Título possível:

`Otimize e converta imagens no seu dispositivo`

Subtexto:

`Escolha as imagens, defina o formato e descarregue o resultado. Os ficheiros não são enviados para os nossos servidores.`

Área de drop:

`Arraste imagens para aqui`

Ação secundária:

`ou selecione ficheiros`

### Ações

- Otimizar
- Converter
- Converter tudo
- Aplicar a todos
- Remover
- Remover tudo
- Descarregar
- Descarregar tudo
- Cancelar
- Repor definições

### Informação de privacidade

`Processamento local`

Tooltip ou detalhe:

`As imagens são processadas no seu browser e não são enviadas para os nossos servidores.`

## 17. Estados da interface

Implementar explicitamente:

1. Estado vazio.
2. Ficheiros carregados e prontos.
3. Ficheiro inválido.
4. Formato não suportado.
5. A processar.
6. Conversão concluída.
7. Conversão parcialmente concluída em lote.
8. Erro de conversão.
9. Trabalho cancelado.
10. Memória insuficiente ou imagem demasiado grande.

Nunca deixar o utilizador perante um spinner sem contexto.

## 18. Validação e segurança no browser

Mesmo sem upload para servidores, os ficheiros são input não confiável.

Implementar:

1. Verificação por MIME e, quando possível, assinatura real do ficheiro.
2. Não confiar apenas na extensão.
3. Limites configuráveis de tamanho por ficheiro.
4. Limites configuráveis de número de ficheiros.
5. Limite de dimensões ou número total de pixels para evitar consumo excessivo de memória.
6. Tratamento de erros do decoder.
7. Cancelamento de workers que fiquem presos.
8. Mensagens claras quando o browser não tiver recursos para concluir a operação.
9. Não executar conteúdo ativo incluído em ficheiros.
10. SVG deve ser tratado com especial cuidado. Rasterizar de forma segura e nunca injetar SVG arbitrário no DOM através de `innerHTML`.

Os limites devem ficar em `src/config/limits.ts`.

## 19. Performance

### Regras

1. Lazy load do motor WASM.
2. Não carregar codecs pesados no primeiro paint se o utilizador ainda não escolheu um ficheiro.
3. Usar Web Workers.
4. Evitar duplicar grandes ArrayBuffers.
5. Criar previews com dimensões adequadas, não usando a imagem integral quando não é necessário.
6. Virtualizar a lista se existirem muitos ficheiros.
7. Limitar processamento paralelo.
8. Medir memória e tempo com ficheiros reais.

### Métricas internas úteis

Sem enviar os dados da imagem:

- tempo de inicialização do motor
- tempo de conversão
- tamanho original
- tamanho final
- redução percentual
- falhas por formato

Estas métricas devem começar apenas em modo de desenvolvimento. Não adicionar analytics de produção sem decisão explícita.

## 20. Acessibilidade

Cumprir pelo menos WCAG 2.2 AA nos fluxos principais.

Obrigatório:

1. Navegação por teclado.
2. Focus visível.
3. Labels reais em inputs.
4. Não depender apenas da cor para estados.
5. Área de drag and drop também utilizável através de botão.
6. Mensagens de erro associadas ao ficheiro certo.
7. `aria-live` para alterações de estado importantes.
8. Contraste suficiente.
9. Controlos com dimensão confortável em dispositivos táteis.
10. Respeitar `prefers-reduced-motion`.

## 21. Responsive design

Testar pelo menos:

- 360 px
- 390 px
- 768 px
- 1024 px
- 1280 px
- 1440 px

Não tratar mobile como uma versão comprimida do desktop.

O conversor deve continuar simples de usar com uma mão num telemóvel.

## 22. Downloads

### Individual

Gerar o resultado como `Blob`, criar object URL, iniciar download e revogar o URL depois de deixar de ser necessário.

### Lote

Usar uma biblioteca de ZIP client-side pequena e estável, por exemplo `fflate`, ou equivalente tecnicamente justificável.

Não enviar ficheiros para um serviço de ZIP remoto.

### Nomes de ficheiro

Preservar o nome original e alterar apenas a extensão por defeito.

Exemplo:

`fotografia-ferias.jpg` para `fotografia-ferias.webp`

Se existir conflito num ZIP, adicionar um sufixo previsível.

## 23. Metadados

O utilizador deve conseguir escolher entre:

1. Remover metadados, recomendado para reduzir tamanho e privacidade.
2. Manter metadados compatíveis, quando o formato de saída permitir.

A orientação visual deve ser preservada mesmo quando os metadados forem removidos.

Aplicar auto orient antes de eliminar EXIF quando necessário.

## 24. Comparação antes e depois

Depois da conversão mostrar:

- formato original
- formato final
- dimensão original
- dimensão final
- tamanho original
- tamanho final
- redução percentual

Fórmula:

```ts
const savingPercent = ((originalSize - outputSize) / originalSize) * 100
```

Se o resultado ficar maior, não esconder esse facto.

Mostrar claramente que houve aumento.

O espelho desta regra também vale: uma redução que não serve para nada não pode
ser apresentada como um ganho. Um recorte de fundo que apaga a imagem produz um
ficheiro minúsculo, e ler isso como uma poupança de 94 % em tom de sucesso é
tão enganador como esconder um aumento. O número mostra-se; o tom acompanha o
que aconteceu de facto à imagem.

## 25. SEO e páginas por conversão

Não é prioridade antes do conversor estar estável, mas a arquitetura deve permitir páginas específicas como:

- `/converter/jpg-para-webp`
- `/converter/png-para-webp`
- `/converter/heic-para-jpg`
- `/converter/png-para-avif`

Estas páginas podem reutilizar o mesmo componente de conversão e pré-selecionar origem e destino.

Não gerar centenas de páginas sem conteúdo útil.

Cada página deve existir apenas quando o par de formatos for realmente suportado.

O conteúdo SEO deve ser escrito em Português de Portugal e não copiar textos dos concorrentes.

## 26. Design visual a evitar

Não entregar um layout que pareça um template de IA.

Evitar especialmente:

1. Dezenas de cartões iguais.
2. Gradiente roxo ou azul como identidade temporária.
3. Fundo com blobs desfocados.
4. Glow à volta do CTA.
5. Hero com mockup de dashboard genérico.
6. Ícones Lucide usados como decoração em todas as linhas.
7. Bordas arredondadas excessivas em todos os elementos.
8. Sombras fortes em todas as superfícies.
9. Texto demasiado grande apenas para parecer moderno.
10. Secções artificiais de marketing antes de o utilizador chegar à ferramenta.

A ferramenta deve ser o elemento principal da página.

## 27. Componentes iniciais

Criar, sem sobreengenharia:

- `AppHeader`
- `PrivacyIndicator`
- `DropZone`
- `FileQueue`
- `FileQueueItem`
- `ImagePreview`
- `CropOverlay`
- `CropControls`
- `ConversionModeControl`
- `FormatSelect`
- `QualityControl`
- `ResizeControls`
- `MetadataControl`
- `AdvancedSettings`
- `ConversionSummary`
- `BatchActionBar`
- `ProgressIndicator`
- `ErrorMessage`

Os componentes não devem conhecer detalhes do ImageMagick. Devem falar apenas com a camada de domínio do conversor.

## 28. Critérios de aceitação do MVP

O MVP só está concluído quando:

1. É possível usar a aplicação sem criar conta, sem registo e sem qualquer ecrã
   de login dentro do produto. O acesso ao site é restringido à equipa fora da
   aplicação, no edge, sem que o código saiba disso. Ver `docs/acesso.md`.
2. É possível selecionar várias imagens.
3. É possível arrastar e largar imagens.
4. A aplicação identifica o formato de cada imagem.
5. O utilizador consegue escolher um formato de destino suportado.
6. A conversão ocorre totalmente no browser.
7. Não existe request de rede com o conteúdo do ficheiro.
8. O utilizador consegue ajustar qualidade quando aplicável.
9. O utilizador consegue redimensionar mantendo a proporção.
10. O utilizador consegue remover metadados.
11. O utilizador vê tamanho original e final.
12. O utilizador consegue descarregar o resultado.
13. O utilizador consegue descarregar um lote num ZIP criado localmente.
14. A interface permanece responsiva durante a conversão.
15. Os principais fluxos funcionam em Chrome, Edge, Firefox e Safari atuais.
16. O conteúdo está em Português de Portugal.
17. O layout não depende de um template visual genérico.
18. Os estilos podem ser adaptados ao futuro manual da marca através de tokens.
19. Não existem rotas de login ou registo.
20. Não existe base de dados necessária para o funcionamento do produto.

## 29. Teste obrigatório de privacidade

Criar um teste manual documentado para validar que os ficheiros não saem do browser.

Procedimento:

1. Abrir DevTools.
2. Abrir Network.
3. Limpar a lista de requests.
4. Selecionar uma imagem.
5. Converter a imagem.
6. Descarregar o resultado.
7. Confirmar que não existiu qualquer request que contenha os bytes da imagem, o ficheiro completo ou um upload multipart.

Adicionar este procedimento ao README do projeto quando o repositório for criado.

## 30. Ordem de implementação

### Fase 1: fundações

1. Criar projeto.
2. Configurar TypeScript strict.
3. Definir estrutura de pastas.
4. Criar tokens visuais provisórios.
5. Criar tipos de domínio.
6. Criar registry de formatos.
7. Criar interface `ImageEngine`.

### Fase 2: prova técnica

1. Carregar uma imagem local.
2. Inicializar o motor WASM apenas quando necessário.
3. Converter JPG para WebP num worker.
4. Criar Blob final.
5. Descarregar resultado.
6. Confirmar no Network que nenhum ficheiro foi enviado.

Não avançar para um UI complexo antes deste fluxo funcionar.

### Fase 3: núcleo do produto

1. Drop zone.
2. Fila de ficheiros.
3. Preview.
4. Escolha de formato.
5. Qualidade.
6. Resize.
7. Metadata.
8. Progresso.
9. Erros.
10. Download.

### Fase 4: lote

1. Vários ficheiros.
2. Aplicar definições a todos.
3. Concorrência controlada.
4. Cancelamento.
5. ZIP local.

### Fase 5: formatos

1. Adicionar formatos por grupos.
2. Criar fixtures de teste para cada formato.
3. Validar decode e encode em browsers reais.
4. Só então ativar o formato na UI.

### Fase 6: identidade visual

Depois de receber o manual de marca:

1. Ler todos os documentos de `docs/brand/`.
2. Extrair cores, tipografia, grelha, espaçamentos, iconografia, fotografia, radius e regras de aplicação.
3. Atualizar tokens.
4. Rever o layout.
5. Rever microcopy se o tom de voz estiver definido.
6. Validar consistência em desktop e mobile.

## 31. Regras para o Claude Code

Ao trabalhar neste projeto:

1. Ler este ficheiro antes de alterar arquitetura ou UX.
2. Não introduzir autenticação sem pedido explícito.
3. Não introduzir uma base de dados sem pedido explícito.
4. Não criar upload de imagens para servidores.
5. Não usar serviços terceiros de conversão.
6. Não adicionar Firebase, Supabase, S3, Cloudinary ou equivalentes para guardar os ficheiros do utilizador.
7. Não implementar uma solução server-side apenas por ser mais fácil.
8. Não expor formatos na UI antes de testar suporte real.
9. Não copiar os sites de referência.
10. Não usar copy em Português do Brasil.
11. Não usar layouts genéricos associados a produtos gerados por IA.
12. Não escolher identidade visual definitiva antes de existir o manual da marca.
13. Antes de adicionar uma dependência, explicar o problema que resolve.
14. Preferir dependências pequenas e bem mantidas.
15. Manter processamento pesado em workers.
16. Garantir que cada nova funcionalidade respeita processamento local.
17. Escrever testes para lógica crítica.
18. Evitar abstrações prematuras.
19. Manter os componentes pequenos e orientados a uma responsabilidade clara.
20. Quando existir dúvida entre conveniência e privacidade, escolher privacidade.

## 32. Definição de pronto para cada funcionalidade

Uma funcionalidade está pronta quando:

1. Funciona no fluxo feliz.
2. Tem estado de erro.
3. Funciona com teclado quando aplicável.
4. Não bloqueia a interface de forma desnecessária.
5. Não cria persistência de imagens.
6. Tem tipos TypeScript corretos.
7. Tem pelo menos testes da lógica crítica.
8. A copy está em Português de Portugal.
9. Foi testada em viewport mobile e desktop.
10. Não introduz um padrão visual que dificulte a futura aplicação da marca.

## 33. Primeira tarefa para executar

Começar apenas pela prova técnica de privacidade e conversão.

Objetivo:

Criar uma página mínima onde seja possível selecionar um JPG, converter localmente para WebP através de um Web Worker e descarregar o resultado sem qualquer upload.

Antes de avançar:

1. Confirmar que o motor WASM funciona no browser escolhido.
2. Confirmar que não existe request de upload.
3. Medir tamanho do bundle adicional.
4. Medir tempo de inicialização do WASM.
5. Medir tempo de conversão com imagens de 1 MP, 12 MP e 24 MP.
6. Registar limitações encontradas.

Só depois desta prova estar estável deve ser construída a experiência completa.
