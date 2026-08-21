# Formatos

A fonte de verdade é `src/config/formats.ts`. Este documento explica como
chegámos aos valores dessa tabela e o que é preciso para ativar um formato.

Nenhum valor da tabela foi copiado da documentação do ImageMagick. Todos
vieram de encode e decode reais contra `@imagemagick/magick-wasm@0.0.42`.

## Motor

```
ImageMagick 7.1.2-29 Q8
delegates: freetype heic jng jp2 jpeg jxl lcms lqr openexr png raw tiff webp xml zlib
```

`Q8` significa 8 bits por canal. Entradas de 16 bits, por exemplo TIFF ou PNG
de alta profundidade, saem reduzidas a 8. É irrelevante para uso em web mas
está documentado em vez de escondido.

## Estado por formato

`release` na tabela controla o que a interface mostra.

| Formato | Entrada | Saída | Estado | Nota |
|---|---|---|---|---|
| JPG, JPEG, JFIF | sim | sim | ativo | aliases do mesmo formato |
| PNG | sim | sim | ativo | sem perda, sem qualidade |
| WebP | sim | sim | ativo | suporta animação e lossless |
| AVIF | sim | sim | em avaliação | exige o define `heic:speed` |
| GIF | sim | sim | em avaliação | animação só pela via de coleção |
| BMP | sim | sim | em avaliação | |
| TIFF, TIF | sim | sim | em avaliação | o browser não descodifica, miniatura tem de vir do motor |
| ICO | sim | sim | em avaliação | magic bytes fracos, releitura exige formato explícito |
| JPEG XL | sim | sim | em avaliação | encode funciona, quase nenhum browser descodifica |
| HEIC, HEIF | sim | **não** | em avaliação | o motor não tem encoder |

## Como ativar um formato

1. Criar uma fixture real do formato, não uma imagem sintética.
2. Confirmar decode e encode nos quatro browsers alvo.
3. Mudar `release` para `'ativo'` em `src/config/formats.ts`.

É só isso. Nenhum componente conhece nomes de formato, portanto não há mais
nada a alterar. `tests/unit/engine-contract.test.ts` valida automaticamente que
cada formato ativo produz bytes que o nosso detetor de assinaturas reconhece
como o formato prometido.

## Armadilhas verificadas do motor

Todas estas estão cobertas por testes, para uma atualização do `magick-wasm`
não as reintroduzir em silêncio.

### Um formato inválido grava em silêncio no formato de origem

`img.write(formatoInvalido, ...)` **não lança**. A biblioteca cai na sobrecarga
que grava no formato de origem e devolve um ficheiro válido do formato errado.
Um utilizador receberia um `.jfif` que era na verdade um PNG, sem erro nenhum.

Foi por isso que `comoMagickFormat` em `MagickImageEngine.ts` valida o nome
contra `Object.values(MagickFormat)` antes de o usar, e que existe um teste que
verifica que cada `magickFormat` da tabela existe no enum real da biblioteca.

### Não existe JFIF

`'Jfif' in MagickFormat` é falso, e a string crua `'JFIF'` lança
`NoEncodeDelegateForThisImageFormat`. JFIF é apenas uma extensão aceite: o
campo `magickFormat` do registry devolve sempre `'JPEG'`.

### HEIC não se consegue escrever

`NoEncodeDelegateForThisImageFormat`. Cobre o caso do iPhone na direção que
interessa, HEIC para JPG ou WebP, mas o inverso não existe. Tem de estar na
tabela para o utilizador não o descobrir a meio de uma conversão.

### AVIF por omissão é inutilizável

Numa imagem de 12 MP:

| `heic:speed` | Tempo | Tamanho |
|---|---|---|
| por omissão | 19,2 s | 477 KB |
| 8 | 2,6 s | 464 KB |
| 9 | 2,1 s | 462 KB |
| WebP q80, referência | 4,0 s | 706 KB |

Com o define correto, o AVIF é mais rápido e mais pequeno que o WebP. Sem ele,
nove vezes mais lento. `resolveEncodeDirectives` aplica-o sempre, e um teste
verifica que continua a ser aplicado.

### Animação só sobrevive pela via de coleção

`MagickImageCollection` preserva os fotogramas. A API de imagem única achata
para um fotograma sem lançar nem avisar, o que o CLAUDE.md proíbe
explicitamente. `collection.length` dá a contagem de fotogramas a partir de um
`ping`, o que permite avisar antes de converter.

### Progressivo em JPEG não é `img.interlace`

`img.interlace` é apenas leitura. O JPEG progressivo obtém-se com
`img.settings.interlace`. Confirmado pelo marcador SOF do ficheiro:
`0xFFC0` é baseline, `0xFFC2` é progressivo.

### `setDefine` está em `img.settings`

Não em `img`. Chamar `img.setDefine` lança `is not a function`.

### `resize` preserva proporção por omissão

`resize(w, h)` trata as dimensões como caixa delimitadora. Pedir 64x64 a uma
imagem 320x200 devolve 64x40. Para dimensões exatas é preciso
`geometry.ignoreAspectRatio = true`, e para não aumentar imagens pequenas
`geometry.greater = true`. Isto alinha com os valores por defeito que
queremos, portanto o comportamento correto é o que não custa nada.

### `ping` é a forma barata de inspecionar

`collection.ping(bytes)` lê cabeçalhos sem descodificar pixels e dá dimensões,
formato, alfa e número de fotogramas. É o que sustenta `inspect` e evita
descodificar 24 MP só para mostrar as dimensões na interface.

## Formatos deliberadamente fora

| Formato | Razão |
|---|---|
| SVG | sem `librsvg` nem `cairo` no binário. Só o renderizador interno, limitado, e é superfície de risco por causa de conteúdo ativo |
| RAW | o delegate `raw` existe, mas são centenas de variantes de câmara e cada uma precisa de validação |
| EXR | escreve, mas a build Q8 não representa HDR, logo não faz sentido |
| PSD, TGA, PCX, DDS, PPM, PGM | escrevem corretamente, mas sem procura que justifique o custo de teste |
