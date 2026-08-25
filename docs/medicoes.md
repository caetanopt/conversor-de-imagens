# Medições

## Como ler este documento

Duas fontes, com fiabilidade diferente:

- **Browser real**: Chromium 141 headless, 4 núcleos, 8 GB de memória
  declarada, através de `/diagnostico`. É o que conta.
- **Node.js 22**: medições anteriores, usadas para investigar o motor. Os
  codecs são o mesmo binário, portanto o suporte de formatos transfere-se, mas
  os tempos não devem ser citados como se fossem do browser.

**Nada disto foi medido em Firefox, Safari, iPhone ou iPad.** Ver
`docs/browser-support.md` para o porquê e para o procedimento de completar a
matriz.

---

## Peso do motor

| | Bytes |
|---|---|
| `magick.wasm` em bruto | 14 687 945 |
| `magick.wasm` em gzip | 5 139 655 |
| Glue JavaScript, no chunk do worker | cerca de 204 KB |

Arranque medido no Chromium, servidor local sem compressão: **256 ms** para
descarregar 14 MB e compilar o módulo. Numa ligação real, a transferência dos
5,1 MB comprimidos domina este número.

O motor não aparece em nenhum chunk carregado pela página. Verificado por
`scripts/verificar-bundle.mjs` contra os ficheiros de `out/`.

---

## Escada de memória e desempenho

PNG gerado localmente para WebP q80, Chromium 141, 4 núcleos.

| Degrau | Dimensões | MP | Origem | Decode | Encode | Total | Saída | Resultado |
|---|---|---|---|---|---|---|---|---|
| 0,5 MP | 800x600 | 0,5 | 445 KB | 7 ms | 179 ms | **187 ms** | 149 KB | ok |
| 1 MP | 1200x900 | 1,1 | 674 KB | 13 ms | 402 ms | **415 ms** | 334 KB | ok |
| 2 MP | 1600x1200 | 1,9 | 938 KB | 21 ms | 744 ms | **765 ms** | 591 KB | ok |
| 4 MP | 2400x1600 | 3,8 | 1,25 MB | 35 ms | 1 421 ms | **1 455 ms** | 1,15 MB | ok |
| 8 MP | 3500x2300 | 8,1 | 1,84 MB | 69 ms | 3 106 ms | **3 175 ms** | 2,42 MB | ok |
| 12 MP | 4200x2800 | 11,8 | 2,28 MB | 102 ms | 4 513 ms | **4 616 ms** | 3,53 MB | ok |
| 16 MP | 4900x3266 | 16,0 | 2,69 MB | 126 ms | 5 972 ms | **6 098 ms** | 4,84 MB | ok |
| 24 MP | 6000x4000 | 24,0 | 3,38 MB | 186 ms | 9 108 ms | **9 294 ms** | 7,20 MB | ok |
| 40 MP | 7746x5164 | 40,0 | 4,53 MB | 301 ms | 53 193 ms | **53 493 ms** | 12,2 MB | ok |
| 60 MP | 9486x6324 | 60,0 | 5,73 MB | 1 387 ms | 80 542 ms | **81 929 ms** | 18,3 MB | ok |
| 100 MP | 12247x8165 | 100,0 | 7,77 MB | - | - | - | - | **falhou** |

A falha a 100 MP foi o worker a morrer, reportada como `motor-terminado`.

### O que estes números dizem

**O encode domina por completo.** O decode é 1 a 3 % do tempo total até aos
40 MP. Otimizar o decode não teria efeito visível; o encode é onde está tudo.

**O tempo cresce de forma não linear a partir dos 24 MP.** De 24 para 40 MP os
pixels aumentam 1,7 vezes e o tempo aumenta **5,8 vezes**. É aí que passa a
fronteira do utilizável, e não no ponto de falha.

**O heap de JavaScript não diz nada.** Variou entre 8 e 67 MB sem relação com o
tamanho da imagem, porque a memória do WASM não aparece nessa leitura. Nenhum
browser a expõe. Por isso o sinal do teste é o degrau que falha, e não um
número de bytes.

### Limites revistos com esta evidência

| Limite | Antes | Agora | Razão |
|---|---|---|---|
| `maxPixels` | 100 MP | **40 MP** | 100 MP mata o worker; 60 MP levou 82 s |
| `avisoPixels` | 40 MP | **12 MP** | a 12 MP já são 4,6 s |
| `avisoDemoraLongaPixels` | não existia | **24 MP** | acima disto são dezenas de segundos |
| `reciclarWorkerAcimaDePixels` | 24 MP | **8 MP** | o heap já cresceu de forma relevante |
| `exclusivoAcimaDePixels` | 16 MP | **8 MP** | igual |
| `timeoutConversaoMs` | 120 s | **180 s** | 40 MP levou 53 s num desktop de 4 núcleos |

Os valores anteriores vinham de uma extrapolação de 23 MB por megapixel medida
em Node. A medição no browser mostrou que o problema real não era a memória, era
o tempo.

**Estes limites são de desktop.** Em telemóvel serão demasiado permissivos, e a
página de diagnóstico existe para os afinar por dispositivo.

---

## Varredura de qualidade

Fonte: PNG 1600x1200, 1,9 MP, 938 KB, conteúdo sintético de alta entropia.
A percentagem é relativa a essa origem.

| Destino | Qualidade | Tamanho | Variação | Decode | Encode |
|---|---|---|---|---|---|
| JPG | 60 | 452 KB | menos 51,8 % | 20 ms | 113 ms |
| JPG | 75 | 606 KB | menos 35,4 % | 20 ms | 127 ms |
| JPG | 82 | 728 KB | menos 22,4 % | 21 ms | 149 ms |
| JPG | 90 | 1,68 MB | **mais 83,9 %** | 26 ms | 281 ms |
| JPG | 100 | 4,16 MB | **mais 353,8 %** | 21 ms | 467 ms |
| WebP | 60 | 484 KB | menos 48,4 % | 21 ms | 684 ms |
| WebP | 75 | 534 KB | menos 43,1 % | 20 ms | 712 ms |
| WebP | 82 | 624 KB | menos 33,5 % | 19 ms | 718 ms |
| WebP | 90 | 789 KB | menos 15,9 % | 25 ms | 785 ms |
| WebP | 100 | **6,7 KB** | menos 99,3 % | 20 ms | 1 351 ms |

### Duas leituras importantes

**O WebP a qualidade 100 muda de modo, não de grau.** O valor absurdo de 6,7 KB
não é um erro de medição: a 100, o libwebp passa a modo sem perda. Confirmado
numa imagem separada de 1200x800:

| WebP | Tamanho | Pixels idênticos ao original |
|---|---|---|
| q 90 | 226 KB | não |
| q 95 | 359 KB | não |
| q 99 | 475 KB | não |
| **q 100** | **1,59 MB** | **sim** |
| define `lossless=true` | 1,59 MB | sim |

A qualidade 100 dá exatamente o mesmo resultado que o define `lossless`. Numa
fotografia isso multiplica o tamanho por 3,4 face a q99. A interface passou a
avisar quando o utilizador escolhe 100 em WebP.

**O JPEG é muito mais rápido que o WebP a codificar**, entre 4 e 6 vezes neste
teste. O WebP compensa em tamanho para o mesmo nível visual, mas o custo em
tempo é real e cresce com a imagem.

Presets em uso:

| Preset | JPG | WebP | AVIF |
|---|---|---|---|
| Qualidade alta | 92 | 90 | 80 |
| Equilibrado | 82 | 80 | 65 |
| Ficheiro mais pequeno | 70 | 65 | 45 |

Nenhum usa 100, deliberadamente. Os valores do AVIF foram calibrados por SSIM,
ver a secção seguinte.

Esta tabela compara só tamanho e tempo, o que se mostrou insuficiente: ver a
secção de SSIM para a comparação correta entre formatos.

---

## Otimização no mesmo formato

Fonte de referência de 1600x1200, convertida pelo motor para cada formato e
depois reprocessada com as definições por defeito.

| Formato | Original | Depois | Variação | Tempo |
|---|---|---|---|---|
| JPG para JPG | 728 KB | 694 KB | **menos 4,7 %** | 271 ms |
| PNG para PNG | 137 KB | 137 KB | **0 %** | 187 ms |
| WebP para WebP | 592 KB | 548 KB | **menos 7,4 %** | 827 ms |

### O PNG não tem margem neste motor

Testado explicitamente numa imagem de 1,68 MB:

| Definição | Tamanho | Variação |
|---|---|---|
| original produzido pelo motor | 1 683 414 | referência |
| `png:compression-level=0` | 2 882 524 | mais 71,2 % |
| `png:compression-level=6` | 1 683 414 | 0 % |
| `png:compression-level=9` | 1 683 414 | 0 % |
| nível 9 com filtro 0 | 1 683 414 | 0 % |
| nível 9 com filtro 5 | 1 683 414 | 0 % |

O encoder de PNG do ImageMagick não é um otimizador: acima do nível por defeito
não existe ganho nenhum, e o único efeito possível é piorar. Expor um controlo
de nível de compressão para PNG seria um controlo sem efeito.

A interface passou a dizer isto de forma explícita quando o utilizador escolhe
otimizar um PNG, e a sugerir WebP. É o caso previsto no CLAUDE.md, secção 6,
para avaliar um codec dedicado numa etapa posterior.

### E o mesmo vale para todos os formatos sem perda

Medido sobre as fixtures, com remoção de metadados aplicada, saída comparada
com a entrada:

| Formato | Original | Depois | Variação |
|---|---|---|---|
| BMP para BMP | 360 138 | 360 138 | 0,0 % |
| TIFF para TIFF | 2 880 288 | 2 880 288 | 0,0 % |
| ICO para ICO | 16 958 | 16 958 | 0,0 % |
| GIF para GIF, estático | 520 829 | 520 829 | 0,0 % |
| GIF para GIF, 6 fotogramas | 153 630 | 153 630 | 0,0 % |

Byte a byte igual em todos. Isto transformou o aviso do PNG numa regra derivada
do registry em vez de uma lista escrita à mão: só existe margem para reduzir
onde o formato tem qualidade com perda para baixar, ou seja onde
`supportsQuality` é verdadeiro. Nos restantes, o motor apenas volta a escrever
com as mesmas definições.

O texto do modo "Otimizar" mudou em consequência. Dizia "Mantém TIFF e reduz o
tamanho do ficheiro", o que era falso. Agora diz que o formato não tem
compressão com perda e que o único ganho possível vem da remoção de metadados.

### O JPEG para JPEG é uma perda irreversível

Reencodificar a qualidade 82 um JPEG originalmente gravado a 88:

| Geração | Tamanho |
|---|---|
| 0, original | 184 542 |
| 1 | 160 262 |
| 2 | 160 277 |
| 3 | 160 295 |
| 4 | 160 314 |

O tamanho estabiliza depois da primeira passagem, portanto não há espiral. Mas
cada passagem descarta informação de forma definitiva, e a redução de 13 % da
primeira geração é paga em qualidade visual. Otimizar um JPEG não é uma operação
sem custo.

---

## Qualidade visual medida com SSIM

O motor tem SSIM embutido (`ErrorMetric.StructuralSimilarity`), portanto medir
distorção não custou nenhuma dependência nova.

**Cuidado com a semântica:** neste motor a métrica devolve **0 para imagens
idênticas** e cresce com a degradação. Comporta-se como dissimilaridade, ao
contrário do que o nome sugere. Verificado comparando uma imagem consigo mesma.
Abaixo chama-se distorção, e menos é melhor.

### Comparar pelo número de qualidade engana

Imagem de 640x480 com gradiente e estrutura, semente fixa:

| q | AVIF bytes | distorção | WebP bytes | distorção | JPEG bytes | distorção |
|---|---|---|---|---|---|---|
| 45 | 13 818 | 0,16467 | 10 566 | 0,17922 | 17 809 | 0,16834 |
| 65 | 34 501 | 0,13636 | 18 046 | 0,16512 | 28 070 | 0,15553 |
| 80 | 76 987 | 0,10073 | 35 302 | 0,13985 | 43 743 | 0,14355 |
| 90 | 116 928 | 0,08738 | 78 298 | 0,10270 | 116 502 | 0,08958 |

À mesma qualidade numérica, o AVIF gasta duas a três vezes mais bytes que o
WebP. Visto assim, o AVIF parece pior. Mas tem sempre **menos distorção**: está
a entregar mais qualidade no mesmo número, não a ser ineficiente.

### A distorção equivalente, o AVIF ganha

| Preset | WebP | AVIF equivalente | Ganho do AVIF |
|---|---|---|---|
| Qualidade alta | q90, 78 298 B | **q80**, 76 987 B | 2 % |
| Equilibrado | q80, 35 302 B | **q65**, 34 501 B | 2 % |
| Ficheiro mais pequeno | q65, 18 046 B | **q45**, 13 818 B | **23 %** |

E o JPEG, para referência: precisa de q85 e 54 156 bytes para igualar a
distorção de WebP q80 com 35 302. O WebP é 35 % menor que o JPEG a qualidade
visual igual, o que justifica ser o destino sugerido por defeito.

### Os presets do AVIF foram calibrados com estes números

`alta` 80, `equilibrado` 65, `menor` 45. Sem calibração, um preset chamado
"Equilibrado" significava coisas diferentes em cada formato. Com ela, a distorção
entre JPG, WebP e AVIF no mesmo preset fica dentro de um fator de 1,04 a 1,31, e
um teste falha acima de 1,5.

**Honestidade sobre o alcance:** o ganho do AVIF é modesto em qualidade alta e
relevante em qualidade baixa, medido em conteúdo sintético. Numa fotografia real
espera-se que seja maior, mas isso não foi medido. Falta uma fotografia real no
conjunto de fixtures.

### O AVIF é mais rápido que o WebP a codificar

Com `heic:speed` 9, numa imagem de 1200x800: AVIF entre 186 e 245 ms, WebP entre
289 e 429 ms. Com `heic:speed` 6 o AVIF sobe para 1 343 a 1 739 ms, sete vezes
mais lento, com uma diferença de tamanho de 1,5 %. A velocidade 9 é a escolha
óbvia.

---

## Redimensionamento

A previsão mostrada na interface e as dimensões que o motor produz são
verificadas em conjunto, nos dois lados, para nove casos. Se divergissem, a
interface prometeria dimensões que o ficheiro não teria.

| Caso | Origem | Pedido | Resultado |
|---|---|---|---|
| largura com proporção | 1200x800 | 600 x auto | 600x400 |
| altura com proporção | 1200x800 | auto x 400 | 600x400 |
| caixa delimitadora | 1200x800 | 600x600 | 600x400 |
| dimensões exatas | 1200x800 | 500x500 sem proporção | 500x500 |
| não aumentar, por defeito | 1200x800 | 2400 x auto | 1200x800 |
| aumentar, pedido | 1200x800 | 2400 x auto, permitido | 2400x1600 |

Reduzir para metade das dimensões deu um ficheiro com menos de metade dos bytes.

---

## Metadados

Medido sobre `tests/fixtures/jpeg-tudo-metadados.jpg`, que contém EXIF com GPS,
XMP e IPTC construídos byte a byte.

| Política | Bytes | Perfis que sobrevivem |
|---|---|---|
| sem tocar | 5 691 | 8bim, exif, iptc, xmp |
| `strip()` | 4 874 | nenhum |
| `strip()` com ICC reanexado | 4 874 | nenhum, este ficheiro não tem ICC |

Sobre `jpeg-icc-e-exif.jpg`, que tem perfil de cor e EXIF:

| Política | Bytes | Perfis |
|---|---|---|
| sem tocar | 5 712 | exif, icc |
| `remover` | 4 874 | nenhum |
| `preservar-cor` | 5 444 | **apenas icc** |

Preservar o perfil custou **570 bytes** para um perfil de 552 bytes.

### Verificação ao nível dos bytes

Cada uma destas cadeias foi procurada no ficheiro de saída, não apenas na lista
de perfis:

| Dado | No original | Depois de `preservar-cor` |
|---|---|---|
| Fabricante | presente | removido |
| Modelo | presente | removido |
| Número de série | presente | removido |
| Data de captura | presente | removido |
| Coordenadas GPS | presente | removido |
| Autor, XMP | presente | removido |
| Autor, IPTC | presente | removido |
| Localidade | presente | removido |

### O motor acrescenta a hora atual ao ficheiro

Achado à conta de as fixtures não serem reproduzíveis. O motor gera atributos
`date:create`, `date:modify` e `date:timestamp` com a hora da leitura, e o
escritor de PNG grava-os em chunks `tEXt`:

```
tEXt = date:modify|2026-08-21T13:37:11+00:00
tEXt = date:timestamp|2026-08-21T13:37:11+00:00
```

Não vêm do ficheiro do utilizador. Com a política `manter`, o ficheiro de saída
ganharia uma data que o original não tinha, revelando quando a conversão
aconteceu. É o oposto de preservar.

São removidos em **todas** as políticas. Verificado: com os carimbos removidos,
duas escritas com 1,1 s de intervalo dão bytes idênticos; sem os remover, dão
ficheiros diferentes.

### Porque o perfil de cor não é removido por defeito

Uma imagem com perfil AdobeRGB, num vermelho saturado:

| Estado | Valor RGB |
|---|---|
| com o perfil AdobeRGB, como é apresentado | 220, 30, 40 |
| transformado corretamente para sRGB | **255, 29, 40** |
| perfil removido, sem transformar | 220, 30, 40 interpretado como sRGB |

Sem o perfil, o browser assume sRGB e apresenta os números crus. A diferença de
35 no canal vermelho é claramente visível: o vermelho fica mais mate.

É por isso que a política por defeito é `preservar-cor`. Ver
`docs/privacidade.md` para a decisão completa.

---

## Animação e fotogramas

Medido em Node com o mesmo binário WASM, fotogramas de `plasma:` com sementes
diferentes, o pior caso de compressão.

### Custo do encode animado

| Fotogramas | Dimensão | GIF | WebP |
|---|---|---|---|
| 2 | 320x240 | 92 790 B, 164 ms | 20 796 B, 65 ms |
| 5 | 320x240 | 234 462 B, 265 ms | 52 410 B, 159 ms |
| 10 | 320x240 | 475 019 B, 747 ms | 104 204 B, 340 ms |
| 20 | 640x480 | 3 381 904 B, 2 795 ms | — |

Duas conclusões que a interface usa:

1. **WebP é 4,5 vezes mais pequeno que GIF** para a mesma animação, e mais
   rápido a codificar. Quando um GIF animado vai perder a animação, a sugestão
   nomeia WebP em primeiro lugar.
2. **O tempo cresce com o número de fotogramas**, o que a área de um fotograma
   não captura. Um GIF de 20 fotogramas a 640x480 são 0,3 MP por fotograma mas
   6,1 MP de trabalho, e levou 2,8 s. Por isso os limites e o agendamento do
   pool passaram a contar `área × fotogramas`, e não só a área.

### `optimize` depende inteiramente da repetição

| Caso | Sem `optimize` | Com `optimize` |
|---|---|---|
| 8 fotogramas idênticos, 400x300 | 523 089 B | 66 290 B |
| 5 fotogramas diferentes, 640x480 | 819 174 B | 819 174 B |
| 20 fotogramas diferentes, 640x480 | 3 381 904 B | 3 381 904 B |

O ganho de 87 % no primeiro caso não é um resultado geral: são fotogramas
byte a byte iguais, reduzidos a um fotograma mais deltas vazios. Com conteúdo
que muda de facto, o ganho é nulo. Custa 36 ms a 115 ms e nunca aumentou o
ficheiro, por isso é aplicado na saída para GIF, sem ser anunciado como uma
otimização que sempre ganha.

Só para GIF. Medido no WebP animado, 34 104 bytes com e sem `optimize`: o WebP
já faz predição entre fotogramas por dentro, portanto aplicá-la ali seria um
passo especulativo sobre um formato que não é o dela.

### WebP animado com fotogramas iguais

Uma medição que quase levou a uma conclusão errada: com 2, 5, 10 e 20
fotogramas **idênticos**, o WebP animado dava sempre 34 404 bytes e 115 ms.
Parecia que só o primeiro fotograma era escrito. Não era: a predição
inter-fotograma do WebP comprime duplicados para quase nada. Com fotogramas
diferentes o tamanho cresce linearmente e o ficheiro tem `ANIM` e `ANMF`, como
deve.

Fica registado porque é o género de número que se interpreta mal: uma constante
onde se esperava crescimento parecia um defeito e era compressão a funcionar.

### Limite real do ICO

| Dimensão | `write` para ICO |
|---|---|
| 320x320 | aceita |
| 512x512 | aceita |
| 640x640 | `WidthOrHeightExceedsLimit` |

O limite do motor é 512, mas o limite utilizável é 256: acima disso o byte de
largura do `ICONDIRENTRY` passa a 0, que na norma significa 256. Ver
`docs/formatos.md`.

## Sem perda, e o teto de qualidade

### O caminho para sem perda em WebP é a qualidade 100, não o define

Medido com SSIM, onde 0 significa idêntico ao original:

| Variante | Tamanho | SSIM |
|---|---|---|
| q80 com perda | 78 206 | 0,053831 |
| q100 com perda | 1 065 458 | **0** |
| `webp:lossless` + q100 | 1 065 458 | **0** |
| `webp:lossless` + q80 | 745 502 | 0,002399 |

Duas conclusões, e a segunda apagou código:

1. **A qualidade 100 já é sem perda.** O define não acrescenta nada a 100: os
   ficheiros são byte a byte iguais.
2. **O define abaixo de 100 não é sem perda.** SSIM 0,0024 num ficheiro que
   ocupava 745 KB. Prometia preservar os pixéis e devolvia uma imagem alterada,
   o pior tipo de opção possível. Foi removido.

O controlo "Sem perda" da interface resolve-se para qualidade 100, que é o
caminho que funciona de facto. E o deslizador de qualidade do WebP passou a ir
até 99, para haver uma única forma de pedir sem perda em vez de duas.

Custo, na mesma imagem: 78 KB com perda contra 1 065 KB sem perda, ou seja
13,6 vezes. Num PNG com transparência a diferença é menor, 30 KB contra 53 KB.
A interface diz que o ficheiro fica bastante maior porque fica.

### O AVIF deste motor não grava à qualidade 100

Verificado degrau a degrau, com e sem o define de velocidade:

| Qualidade | Resultado |
|---|---|
| 95 | 280 256 bytes |
| 98 | 311 674 bytes |
| 99 | 335 990 bytes |
| 100 | `AOM encoder error: Invalid parameter` |

Não é uma degradação, é um erro do encoder. O deslizador ia até 100 em todos os
formatos, portanto arrastá-lo até ao fim num AVIF era um estado alcançável que
falhava sempre. O teto passou a vir do registry, e a camada de diretivas
também o impõe: um valor guardado antes de o formato mudar chegaria intacto ao
motor.

Isto também confirma que o AVIF deste motor não tem modo sem perda, e que
`supportsLossless: false` na tabela estava certo.

## Contraste de cor

Nunca tinha sido medido. A secção 20.8 do CLAUDE.md exige contraste suficiente
e a WCAG 2.2 AA fixa os limiares em 4,5:1 para texto normal e 3:1 para o que é
necessário identificar um componente.

Nove pares falhavam, cinco no tema claro e quatro no escuro:

| Par | Onde | Antes | Limiar |
|---|---|---|---|
| `--text-faint` sobre `--surface-page` | dimensões da imagem | 3,21:1 | 4,5:1 |
| `--text-faint` sobre `--surface-raised` | notas do painel | 3,37:1 | 4,5:1 |
| `--state-caution` sobre o seu fundo | aviso de fotogramas | 4,24:1 | 4,5:1 |
| `--line-strong` sobre `--surface-page` | moldura de controlo | 1,91:1 | 3:1 |
| `--line-strong` sobre `--surface-raised` | moldura de controlo | 2,00:1 | 3:1 |

E no tema escuro, `--text-faint` a 4,07:1 e 3,76:1, e `--line-strong` a 2,24:1
e 2,07:1.

As correções não foram escolhidas a olho: um solver procurou a luminosidade
mínima que atinge o limiar contra cada fundo, e o valor aplicado é o mais
exigente dos dois com uma pequena margem.

A das molduras teve uma consequência de desenho. `--line-strong` e
`--line-default` servem dois papéis diferentes, separar regiões e delimitar
controlos, e só o segundo está sujeito ao critério 1.4.11. Forçar 3:1 num token
usado em todas as molduras de cartão tornaria a interface pesada, portanto o
papel foi separado: `--line-control` para a moldura de um campo numérico, de um
botão secundário e da zona de largar, que é o que identifica esses controlos.

Está tudo em `tests/unit/contraste.test.ts`, com a lista de pares escrita à mão
de propósito: um teste que combinasse todas as cores com todas as superfícies
falharia em pares que nunca aparecem juntos e ensinaria a ignorar o resultado.
Quando o manual da marca chegar, este teste diz logo o que deixou de passar.

## Capacidades do browser

Chromium 141: **17 de 17** capacidades suportadas.

Uma nota sobre a primeira execução: a sonda de `CSS :has()` reportou "não
suportado" num Chromium que o suporta. Era um erro da sonda, que usava a forma
de dois argumentos de `CSS.supports` para uma condição `selector(...)`.
Corrigido. Um falso negativo numa sonda é pior do que não ter sonda.

---

## Por medir

- Firefox, Safari em macOS, Safari em iOS e iPadOS. Ver `docs/browser-support.md`.
- Uma fotografia real no conjunto de fixtures. Todas as medições de qualidade
  usam conteúdo sintético, que subestima o ganho do AVIF.
- A escada de memória com AVIF em vez de WebP. O AVIF é mais rápido a codificar,
  portanto o degrau de falha pode ser diferente.
- A escada de memória num telemóvel, que é onde os limites atuais serão
  demasiado permissivos.
- Decode de JPEG progressivo e de CMYK com temporização separada. As fixtures
  existem e os testes confirmam que decodificam, mas não há números de tempo.
- HEIC com um ficheiro real de iPhone. Continua sem ser testado.
- Tempo de arranque com transferência real e com cache do browser.
