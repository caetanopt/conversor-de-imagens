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

**Reciclagem por marca de água.** A memória linear do WASM nunca encolhe. Medido:
o heap estabiliza em cerca de 274 MB depois de uma imagem de 12 MP e não cresce
em trabalhos repetidos, portanto não há fuga. O problema é o pico, cerca de
23 MB por megapixel. Acima do limiar em `limits.ts`, o worker é substituído
depois do trabalho.

**Sem progresso falso.** O `magick-wasm` não expõe progresso durante o encode.
Por ficheiro mostramos estados nomeados. Uma percentagem determinada só faz
sentido ao nível do lote, e entra quando o lote entrar.

**Concorrência 1 nesta etapa.** O pool de vários workers entra com o lote,
atrás da mesma API do `EngineClient`, sem os chamadores mudarem.

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

## Onde acrescentar coisas

| Quero | Mexo em |
|---|---|
| Ativar um formato | `config/formats.ts`, campo `release` |
| Mudar limites de tamanho ou memória | `config/limits.ts` |
| Mudar valores dos presets | `config/presets.ts` |
| Acrescentar uma opção de encoder | `lib/image-engine/options.ts` e o painel de definições |
| Aplicar a identidade da marca | `styles/tokens.css` |
| Acrescentar o lote | `EngineClient` passa a ter um pool, o reducer já suporta lista |
