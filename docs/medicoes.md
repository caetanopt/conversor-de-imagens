# Medições

## Como foram obtidas

Todos os números abaixo foram medidos com `@imagemagick/magick-wasm@0.0.42`,
o mesmo binário que a aplicação usa.

Ambiente: Node.js 22 em Linux x86_64, imagem de origem `plasma:fractal`, que é
ruído de alta entropia e portanto o pior caso para compressão. Fotografias
reais serão mais rápidas e comprimem melhor.

**Estas medições ainda não foram repetidas em browsers reais.** Os codecs são o
mesmo binário WASM, portanto o suporte de formatos transfere-se, mas os tempos
e sobretudo o teto de memória dependem do browser e do dispositivo. Repetir em
Chrome, Edge, Firefox e Safari é trabalho da próxima etapa.

## Peso do motor

| | Bytes |
|---|---|
| `magick.wasm` em bruto | 14 687 945 |
| `magick.wasm` em gzip | 5 139 655 |
| Glue JavaScript, no chunk do worker | cerca de 204 KB |

Compilar o módulo a partir de um buffer local levou 143 ms. O tempo total de
arranque percebido pelo utilizador é dominado pela transferência.

## Conversão

| Imagem | JPEG para WebP q80 | JPEG para AVIF q50 speed 9 |
|---|---|---|
| 1 MP | 402 ms | rápido |
| 12 MP | 4 068 ms | 2 057 ms |
| 24 MP | 8 358 ms | não medido |

Numa fotografia de 1 MP no browser, medido pela aplicação, JPG para WebP q80
levou cerca de 390 ms.

## AVIF e o define `heic:speed`

Imagem de 12 MP, qualidade 50:

| `heic:speed` | Tempo | Tamanho |
|---|---|---|
| por omissão | 19,2 s | 477 KB |
| 6 | 15,1 s | 477 KB |
| 8 | 2,6 s | 464 KB |
| 9 | 2,1 s | 462 KB |
| WebP q80, referência | 4,0 s | 706 KB |

Conclusão: sem este define o AVIF não é utilizável. Com `speed` 9 é mais rápido
e mais pequeno que o WebP. A aplicação aplica-o sempre, em
`resolveEncodeDirectives`.

## Memória

Quatro conversões consecutivas de 12 MP no mesmo processo:

| Momento | RSS |
|---|---|
| depois de inicializar o motor | 248 MB |
| depois do trabalho 1 | 274 MB |
| depois dos trabalhos 2, 3 e 4 | 274 MB |

Não há fuga: o heap estabiliza. O que existe é uma marca de água, cerca de
23 MB por megapixel, e a memória linear do WASM nunca encolhe. Uma imagem
grande inflaciona o worker para o resto da sessão.

Daí as três decisões em `config/limits.ts`:

- recusa acima de 100 MP, porque a esse ritmo passaria de 2 GB
- aviso acima de 40 MP
- reciclagem do worker depois de trabalhos acima de 24 MP

## Bundle

O motor fica num chunk que a página não carrega. Verificado por
`scripts/verificar-bundle.mjs` contra os ficheiros reais de `out/`.

| | |
|---|---|
| Chunks carregados pela página | 8 |
| Chunk que contém `initializeImageMagick` | 1, não referenciado pelo `index.html` |

## Por medir

- Tempos e teto de memória em Chrome, Edge, Firefox e Safari reais
- Comportamento em telemóvel, sobretudo Safari em iOS, onde o limite de
  memória é bastante mais baixo
- Tempo de arranque do motor com transferência real, incluindo cache do browser
- AVIF a 24 MP
- Decode de HEIC com um ficheiro real de iPhone, que ainda não foi testado
