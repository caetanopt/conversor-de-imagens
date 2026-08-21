# Arquitetura

## Camadas

A dependência aponta sempre para dentro. Nada acima da camada do motor conhece
ImageMagick.

```
Componentes React            não conhecem o motor nem o worker
        |
useConverter + jobsReducer   fila, estados por ficheiro, presets
        |
EngineClient                 API tipada, promessas, timeouts, cancelamento
        |
    ..... fronteira postMessage, ArrayBuffer transferido .....
        |
image.worker.ts              único ficheiro onde o motor corre
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
Por ficheiro mostramos estados nomeados. Uma percentagem determinada só faz
sentido ao nível do lote, e entra quando o lote entrar.

**Decode e encode medidos em separado.** O adaptador marca o instante em que o
callback de `read` começa, que é quando a descodificação terminou. Medido no
Chromium, o encode é 97 a 99 % do tempo total até aos 40 MP. Otimizar o decode
não teria efeito visível.

**Concorrência 1 nesta etapa.** O pool de vários workers entra com o lote,
atrás da mesma API do `EngineClient`, sem os chamadores mudarem.

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

`useReducer` para a fila, sem store global. O estado já é uma lista de
`ImageJob` mesmo que a interface trate um ficheiro de cada vez: quando o lote
entrar, a forma do estado não muda.

Invariantes que o reducer garante, cobertas por testes:

- o ID de um trabalho nunca é o nome do ficheiro
- mudar o formato de destino invalida o resultado anterior, senão o utilizador
  descarregava um WebP a pensar que era um PNG
- um erro limpa o resultado e um resultado limpa o erro
- mudar para um formato sem perda apaga a qualidade herdada
- ajustar a qualidade à mão desliga o preset, e escolher um preset recalcula a
  qualidade para o formato atual

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
| Mudar limites de tamanho ou memória | `config/limits.ts` |
| Mudar valores dos presets | `config/presets.ts` |
| Acrescentar uma opção de encoder | `lib/image-engine/options.ts` e o painel de definições |
| Aplicar a identidade da marca | `styles/tokens.css` |
| Acrescentar o lote | `EngineClient` passa a ter um pool, o reducer já suporta lista |
| Mudar a política de metadados | `lib/image-engine/options.ts`, `resolveMetadataDirective` |
| Acrescentar uma sonda de capacidade | `lib/dev/capacidades.ts` |
| Acrescentar um degrau à escada de memória | `features/diagnostico/medicoes.ts`, `ESCADA` |
