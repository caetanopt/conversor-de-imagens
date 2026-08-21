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

Presets em uso: `Qualidade alta` 92 em JPG e 90 em WebP, `Equilibrado` 82 e 80,
`Ficheiro mais pequeno` 70 e 65. Nenhum usa 100, deliberadamente.

Não foi medido SSIM nem outra métrica de qualidade visual. A comparação é só de
tamanho e tempo.

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

## Capacidades do browser

Chromium 141: **17 de 17** capacidades suportadas.

Uma nota sobre a primeira execução: a sonda de `CSS :has()` reportou "não
suportado" num Chromium que o suporta. Era um erro da sonda, que usava a forma
de dois argumentos de `CSS.supports` para uma condição `selector(...)`.
Corrigido. Um falso negativo numa sonda é pior do que não ter sonda.

---

## Por medir

- Firefox, Safari em macOS, Safari em iOS e iPadOS. Ver `docs/browser-support.md`.
- A escada de memória num telemóvel, que é onde os limites atuais serão
  demasiado permissivos.
- Decode de JPEG progressivo e de CMYK com temporização separada. As fixtures
  existem e os testes confirmam que decodificam, mas não há números de tempo.
- HEIC com um ficheiro real de iPhone. Continua sem ser testado.
- Métricas de qualidade visual, por exemplo SSIM. Só temos tamanho e tempo.
- Tempo de arranque com transferência real e com cache do browser.
