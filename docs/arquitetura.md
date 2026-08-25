# Arquitetura

## Camadas

A dependência aponta sempre para dentro. Nada acima da camada do motor conhece
ImageMagick.

```
Componentes React            não conhecem o motor nem o worker
        |
useConverter + jobsReducer   fila, estados por ficheiro, presets
   + selectors               estado do lote derivado, sem estado duplicado
        |
EngineClient                 API tipada, promessas, timeouts, cancelamento
        |
WorkerPool                   concorrência, exclusividade, reciclagem, fila
        |
    ..... fronteira postMessage, ArrayBuffer transferido .....
        |
image.worker.ts              único ficheiro onde o motor corre, um por slot
        |
MagickImageEngine            implementa ImageEngine sobre magick-wasm
```

O contrato está em `src/lib/image-engine/ImageEngine.ts`. Trocar ou acrescentar
um motor, por exemplo codecs especializados para WebP ou AVIF se os benchmarks
o justificarem, é escrever outra implementação.

## Desvios deliberados face ao esboço do CLAUDE.md

**`inspect` recebe `ArrayBuffer` e não `File`.** O motor vive dentro de um Web
Worker e um `File` não atravessa a fronteira. Atravessam apenas os bytes,
transferidos sem cópia. Manter `File` na assinatura obrigaria a uma cópia extra
de cada imagem, contra o requisito 19.4.

**Sem Tailwind.** A folha de estilos é CSS Modules sobre as variáveis de
`src/styles/tokens.css`. Um único vocabulário de estilos, sem utilities no
markup, e a marca aplica-se editando um ficheiro. O CLAUDE.md permite Tailwind
mas não o exige, e ter as duas coisas convidava a inconsistência. É reversível:
acrescentar Tailwind depois não obriga a mexer nos módulos.

**TypeScript 6.0.3 e não 7.0.2.** O 7 é a reescrita nativa do compilador e é a
versão `latest`, mas Next 16, React 19 e o ecossistema de lint já são
superfície nova suficiente para uma primeira fatia.

## Decisões do cliente do motor

**Carregamento tardio.** O binário tem 5,1 MB comprimidos. O worker só é criado
quando existe um ficheiro, e a interface mostra um estado nomeado enquanto o
motor prepara, em vez de um spinner sem contexto.

**Cancelamento é terminar o worker.** A conversão é uma chamada síncrona dentro
do WASM e não é interrompível a meio. Não há cancelamento cooperativo possível.
Cancelar termina o worker e recria-o à próxima utilização. É uma limitação real
do motor, assumida em vez de disfarçada.

**Reciclagem por marca de água.** A memória linear do WASM nunca encolhe, e
nenhum browser a expõe a JavaScript. Medido em Node, o heap estabiliza depois do
primeiro trabalho grande e não cresce em trabalhos repetidos, portanto não há
fuga: o que existe é um pico que fica. Acima do limiar em `limits.ts`, hoje
8 MP, o worker é substituído depois do trabalho.

A medição no browser mostrou que o fator limitante não é a memória, é o tempo:
40 MP levaram 53 s e 100 MP mataram o worker. Ver `docs/medicoes.md`.

**Sem progresso falso.** O `magick-wasm` não expõe progresso durante o encode.
Por ficheiro mostramos estados nomeados. No lote a contagem é real, porque
contar ficheiros terminados é uma medida que existe: "a converter 2 de 10", e
não uma percentagem inventada dentro de cada conversão.

**Decode e encode medidos em separado.** O adaptador marca o instante em que o
callback de `read` começa, que é quando a descodificação terminou. Medido no
Chromium, o encode é 97 a 99 % do tempo total até aos 40 MP. Otimizar o decode
não teria efeito visível.

## O pool de workers

`WorkerPool` substituiu o worker único sem mudar a API do `EngineClient`:
nenhum chamador foi alterado. Três comportamentos, todos com origem em medições
e não em precaução genérica.

**Slots preguiçosos.** Cada worker paga o seu próprio heap de WASM e a sua
própria compilação do módulo. O segundo slot só é criado quando há contenção
real, para o caso comum de um único ficheiro não pagar por concorrência que não
usa.

**Exclusividade acima de 8 MP.** Uma tarefa grande espera que todos os slots
fiquem livres e corre sozinha. Duas conversões de 8 MP em paralelo duplicam o
pico de memória, e a memória linear do WASM nunca encolhe: o pico fica.

**Cancelamento dirigido por chave.** Cancelar é terminar o worker, portanto
cancelar um ficheiro não pode matar os outros que estão a correr. O pool guarda
a chave da tarefa em cada slot e termina apenas o slot certo. Uma tarefa ainda
em fila é rejeitada sem tocar em worker nenhum.

O erro de cancelamento tem um `kind` próprio, `cancelado`, distinto de
`motor-terminado`. Sem essa distinção, cancelar um ficheiro pintava-o de
vermelho como se tivesse falhado.

**`onInicio` para a interface não mentir.** O estado passa a `processing`
quando a tarefa recebe um slot, não quando entra na fila. Com 30 ficheiros e
concorrência 2, a alternativa era mostrar 30 conversões a decorrer quando
estão duas.

A concorrência efetiva é `min(2, hardwareConcurrency - 1)`. O limite superior
está em `limits.ts` e é conservador de propósito.

## O lote

Não há um segundo caminho de código. `converterJob` converte um trabalho, e
`converter` e `converterTodos` diferem apenas em quantos chamam e em quem conta
os resultados. Todos os trabalhos entram na fila do pool ao mesmo tempo; o pool
decide quantos correm.

O resumo do lote conta os desfechos devolvidos pelas promessas, não o estado
depois do `await`. Os últimos `dispatch` podem ainda não ter sido aplicados
quando o `Promise.all` resolve, e um resumo lido nesse instante estaria errado
por um ficheiro.

`resumirLote` deriva o estado do lote a partir da lista, e inclui `parcial`:
com três falhas em dez, dizer "concluído" seria mentira. O CLAUDE.md, secção
17.7, exige esse estado explícito.

`porConverter` sai do mesmo predicado que `convertiveis`, para o número no
botão nunca divergir do que a ação faz. Esse predicado distingue erros que
valem uma nova tentativa, como um erro do motor, de erros que são propriedades
do ficheiro de entrada, como um ficheiro danificado: mudar a qualidade não
torna um ficheiro corrompido legível.

A análise inicial dos ficheiros é sequencial de propósito. Cada `inspect` lê o
ficheiro inteiro para memória antes de o transferir para o worker, e trinta em
paralelo seriam trinta ficheiros em memória ao mesmo tempo.

## ZIP local

`fflate`, com `level: 0`. Os ficheiros que entram no ZIP já são JPEG, PNG, WebP
ou AVIF, todos comprimidos: voltar a comprimir gasta tempo e memória para
ganhar quase nada, e em dados incompressíveis aumenta.

Os nomes são resolvidos antes de empacotar. `foto.jpg` e `foto.png` convertidos
para WebP dão os dois `foto.webp`, e um ZIP com nomes repetidos perde uma
entrada em silêncio. O segundo passa a `foto-2.webp`.

O nome do ZIP não tem data nem hora. Um carimbo temporal revelaria quando o
utilizador processou as imagens, que é exatamente o tipo de dado que a política
de metadados remove dos ficheiros.

## Uma única via de conversão, pela coleção

A conversão deixou de usar `ImageMagick.read` e passou a usar
`MagickImageCollection`. A razão é uma armadilha medida: a API de imagem única
achata um ficheiro de vários fotogramas para um, sem lançar nem avisar, o que o
CLAUDE.md, secção 5.8, proíbe.

Não há dois caminhos. Um ficheiro de um fotograma pela via de coleção produz
bytes idênticos, no mesmo tempo (JPEG 800x600 para WebP: 51 164 bytes nas duas
vias, 196 ms contra 206 ms). Manter o caminho antigo para o caso comum só criava
a possibilidade de um deles esquecer os fotogramas.

A ordem dentro da conversão de vários fotogramas não é arbitrária:

1. `coalesce`, para os fotogramas parciais com deslocamento passarem a
   fotogramas completos. Sem isto, redimensionar cada um em separado parte a
   animação.
2. as diretivas por fotograma: orientação, metadados, geometria, qualidade.
3. `optimize`, só na saída para GIF.
4. `write` da coleção.

`multiFrame` no registry decide quando preservar: vários fotogramas só se
mantêm quando a origem e o destino querem dizer o mesmo com eles. Uma animação
não se guarda como conjunto de tamanhos de um ícone. Quando é preciso reduzir a
um fotograma, num ICO escolhe-se o maior e não o primeiro, porque medido um ICO
com 16, 48 e 256 px devolvia 16x16 pela API de imagem única.

O `EngineConversion` devolve `frameCount` e `outputFrameCount`. Diferentes
significa perda, e a interface não a esconde.

## Miniaturas de formatos que o browser não lê

`criarPreview` usa `createImageBitmap`, que falha nos formatos que o browser
não descodifica. Nesse caso devolve null e a miniatura vem do motor, pela
operação `thumbnail`. É a única forma de um TIFF ter pré-visualização.

A decisão é do registry e não de uma lista de casos especiais:
`browserDecodable` diz quem precisa do motor. O caminho do browser continua a
ser o preferido, porque é mais rápido e não ocupa o motor.

## O aviso tem de vir antes, não depois

O que acontece aos fotogramas depende do par (origem, destino), e o destino
muda depois de o ficheiro entrar: o mesmo GIF mantém a animação em WebP e
perde-a em PNG. Por isso não é um aviso guardado na validação: é
`avaliarFrames(inspection, outputFormat)`, uma função pura recalculada a cada
render e mostrada junto ao seletor de destino, com os formatos que resolveriam
o problema. Depois da conversão seria uma desculpa.

O mesmo raciocínio vale para o limite de dimensão do ICO:
`avaliarLimiteDeDimensao` diz, antes de converter, com que tamanho o ficheiro
vai sair. Reduzir a imagem em silêncio seria o mesmo erro de destruir animação
em silêncio.

Os dois avisos partilham um componente `Notice`, porque um bloco com o mesmo
aspeto em dois sítios não deve ter dois estilos.

## Otimizar e converter são o mesmo pipeline

Não há dois caminhos de código. A única diferença é uma restrição no formato de
destino: em `otimizar`, o destino é o formato de origem. A ação `modo` no
reducer reajusta o `outputFormat` de cada trabalho, e `formatoDeOtimizacao`
devolve `null` quando otimizar no mesmo formato não é possível, o que acontece
se o motor souber ler mas não escrever esse formato. HEIC é o caso óbvio.

Duas honestidades que as medições impuseram na interface:

- **Otimizar um PNG não produz ganho.** O encoder de PNG do ImageMagick não é
  um otimizador: acima do nível de compressão por defeito o resultado é
  byte a byte idêntico. A interface diz isso e sugere WebP.
- **WebP a qualidade 100 muda para modo sem perda.** Não é um degrau acima de
  99: o ficheiro fica 3,4 vezes maior. A interface avisa.

Ver `docs/medicoes.md` para os números.

## Redimensionamento

A previsão que a interface mostra e a geometria que o motor executa são a mesma
decisão calculada em dois sítios, e por isso são testadas em conjunto:
`calcularSaida` e o resize real do motor têm de dar o mesmo resultado nos nove
casos cobertos. Prometer dimensões que o ficheiro não vai ter é pior do que não
mostrar previsão nenhuma.

A semântica vem do motor e não foi inventada: as dimensões são uma caixa
delimitadora, `greater` significa só reduzir, e `ignoreAspectRatio` dá dimensões
exatas. Os valores por defeito que queremos, preservar proporção e não aumentar,
são o comportamento que não custa nada.

## Acessibilidade verificada, não assumida

Duas coisas que a secção 20 do CLAUDE.md exige e que não se verificam a olho
passaram a ser testes.

**Contraste.** `tests/unit/contraste.test.ts` lê `src/styles/tokens.css`, faz a
conversão de oklch para sRGB e mede a razão de contraste de cada par que o
produto mostra, nos dois temas, contra os limiares da WCAG 2.2 AA. Lê o CSS em
vez de duplicar os valores, para o teste falhar quando alguém editar as cores.
Encontrou nove pares abaixo do limiar, e é a rede que apanha o mesmo problema
quando o manual da marca substituir os valores.

Isto obrigou a separar um papel de token. `--line-strong` e `--line-default`
servem para separar regiões, e o critério 1.4.11 não se aplica a isso; a
moldura de um campo numérico ou de um botão secundário é o que identifica esses
controlos, e essa tem de cumprir 3:1. Passou a haver `--line-control` para o
segundo caso, em vez de escurecer todas as molduras da interface.

**Larguras.** `tests/e2e/responsive.spec.ts` corre as seis larguras da secção
21 e verifica três coisas concretas: a página não ganha deslocamento
horizontal, nenhum elemento transborda a própria caixa, e todas as oito opções
de formato ficam dentro do ecrã. Não repete a suite inteira em seis perfis:
verifica o que muda com a largura.

O alvo de toque de 44 px só é exigido onde `pointer: coarse`. Os botões reduzem
para 36 px sob `pointer: fine` de propósito, e confundir estreito com tátil
faria o teste exigir alvos de dedo a quem usa rato.

## Página de diagnóstico

`/diagnostico` é uma ferramenta interna, fora do índice e sem ligações a partir
do produto. Corre no browser que a abre: sonda de capacidades, informação do
motor, otimização no mesmo formato, varredura de qualidade, e uma escada de
dimensões que sobe até a conversão falhar.

Existe porque nem Firefox nem WebKit podem ser instalados neste ambiente, e
porque nenhum teste automatizado substitui abrir a aplicação num iPhone real.
Ver `docs/browser-support.md`.

As imagens de teste são geradas por `lib/dev/gerarPng.ts`, que constrói um PNG
válido de dimensões arbitrárias sem usar canvas, em streaming. Duas razões:
os browsers limitam a área de um canvas, e o Safari em iOS é o mais restritivo,
portanto o limite medido seria o do canvas e não o do motor; e um canvas de
24 MP ocuparia 96 MB na main thread antes de a conversão começar.

## Estado

`useReducer` para a fila, sem store global. O estado é uma lista de `ImageJob`
mais o modo e o identificador do ficheiro selecionado. Foi lista desde a
primeira etapa, quando a interface tratava um ficheiro de cada vez, e por isso
o lote não obrigou a mudar a forma do estado.

As funções assíncronas do lote leem o estado de uma referência atualizada a
cada render, e não de um closure. Um closure sobre o estado ficava velho a meio
de trinta conversões, e a alternativa era recriar todas as funções a cada
`dispatch`.

Invariantes que o reducer garante, cobertas por testes:

- o ID de um trabalho nunca é o nome do ficheiro
- mudar o formato de destino invalida o resultado anterior, senão o utilizador
  descarregava um WebP a pensar que era um PNG
- um erro limpa o resultado e um resultado limpa o erro
- mudar para um formato sem perda apaga a qualidade herdada
- ajustar a qualidade à mão desliga o preset, e escolher um preset recalcula a
  qualidade para o formato atual
- `aplicar a todos` não altera o ficheiro de origem, invalida resultados que
  deixaram de corresponder às definições, e em modo `otimizar` não copia o
  formato de destino, porque nesse modo o destino é imposto pela origem de cada
  ficheiro
- remover o ficheiro selecionado passa a seleção para o primeiro que sobra, em
  vez de deixar o painel sem contexto

## Ciclo de vida dos bytes

```
File (apontador para o disco)
  -> arrayBuffer() a cada operação, para não retermos 100 MB entre passos
  -> postMessage com transfer list, buffer destacado na origem
  -> worker: ImageMagick.read, diretivas, write
  -> ArrayBuffer transferido de volta
  -> Blob na main thread
  -> object URL para descarregar, revogado no tick seguinte
```

As miniaturas seguem um caminho separado e limitado: `createImageBitmap` com as
dimensões já pedidas, desenho para canvas do tamanho alvo, blob pequeno, e
`bitmap.close()` imediato.

## Ordem das operações na conversão

Imposta em `aplicarDiretivas`, e a ordem não é arbitrária:

1. `autoOrient` antes de `strip`. Ao contrário, a rotação EXIF perde-se e a
   imagem sai deitada.
2. `resize`.
3. `quality`.
4. `settings.interlace` para JPEG progressivo.
5. defines específicos do formato, incluindo `heic:speed` para AVIF.

## Detalhes do motor que causaram bugs reais

Registados aqui porque nenhum deles é óbvio, e todos foram encontrados por
testes e não por leitura do código.

**`write` com um formato inválido não lança.** Cai na sobrecarga que grava no
formato de origem e devolve um ficheiro válido do formato errado. Um utilizador
receberia um `.jfif` que era um PNG, sem erro. `comoMagickFormat` valida agora o
nome contra o enum real da biblioteca.

**O objeto devolvido por `getProfile` não sobrevive ao `strip()`.** É uma vista
sobre a memória da imagem. Guardá-lo e reutilizá-lo lança
`ColorspaceColorProfileMismatch`, de forma dependente do estado do heap: em
isolamento passa, depois de uma imagem grande ter sido descodificada falha. Os
bytes são agora copiados de imediato.

**`img.interlace` é apenas leitura.** O JPEG progressivo obtém-se com
`img.settings.interlace`, confirmado pelo marcador SOF do ficheiro.

**`setDefine` vive em `img.settings`**, não em `img`.

**Um ficheiro truncado não lança.** O ImageMagick tolera a truncagem e
descodifica o que consegue, produzindo uma imagem parcial. Não é um erro, mas
também não é óbvio.

**O motor acrescenta a hora atual à imagem**, em atributos `date:*` que o
escritor de PNG grava em chunks `tEXt`. São removidos em todas as políticas de
metadados, porque não são do utilizador. Ver `docs/privacidade.md`.

**`plasma:` não é determinístico** sem `Magick.setRandomSeed`. Isto fez as
fixtures mudarem a cada execução e um teste de tamanhos passar isolado e falhar
na suite.

**`ErrorMetric.StructuralSimilarity` devolve 0 para imagens idênticas** e cresce
com a degradação, ao contrário do que o nome sugere.

## Onde acrescentar coisas

| Quero | Mexo em |
|---|---|
| Ativar um formato | `config/formats.ts`, campo `release` |
| Limitar as dimensões de saída de um formato | `config/formats.ts`, `maxOutputDimension` |
| Mudar limites de tamanho ou memória | `config/limits.ts` |
| Mudar valores dos presets | `config/presets.ts` |
| Acrescentar uma opção de encoder | `lib/image-engine/options.ts` e o painel de definições |
| Aplicar a identidade da marca | `styles/tokens.css` |
| Mudar a concorrência ou os limiares do pool | `config/limits.ts`, e `WorkerPool` se a política mudar |
| Mudar a compressão do ZIP | `lib/download/zipResults.ts` |
| Virtualizar a fila | `features/converter/components/FileQueue.tsx` |
| Mudar a política de metadados | `lib/image-engine/options.ts`, `resolveMetadataDirective` |
| Acrescentar uma sonda de capacidade | `lib/dev/capacidades.ts` |
| Acrescentar um degrau à escada de memória | `features/diagnostico/medicoes.ts`, `ESCADA` |
