# Suporte de browsers

## O que foi testado e o que nao foi

Esta e a parte mais importante do documento, por isso vem primeiro.

| Browser | Motor | Estado | Como |
|---|---|---|---|
| Chromium, HeadlessChrome 141 | Blink | **testado** | 14 testes end to end em dois perfis, mais a pagina de diagnostico |
| Chrome, Edge | Blink | **inferido, nao testado** | partilham o motor com o Chromium testado, mas nao foram executados |
| Firefox | Gecko | **nao testado** | binario indisponivel no ambiente |
| Safari em macOS | WebKit | **nao testado** | binario indisponivel no ambiente |
| Safari em iOS, iPhone | WebKit | **nao testado** | exige dispositivo real |
| Safari em iPadOS | WebKit | **nao testado** | exige dispositivo real |

**Nao assumimos equivalencia com o Chromium.** Firefox e WebKit tem
implementacoes independentes de tudo o que este produto usa: workers de modulo,
compilacao de WebAssembly, limites de memoria, `createImageBitmap`, encode de
WebP em canvas, e o comportamento do atributo `download`. Nenhuma dessas coisas
foi verificada fora do Blink.

### Porque nao foi possivel testar

O ambiente de desenvolvimento nao tem Firefox nem WebKit instalados, e a
politica de rede bloqueia o CDN de onde o Playwright os descarrega:

```
Error: Download failed: server returned code 403
body 'request blocked: no rule or allowlist entry allows host "cdn.playwright.dev"'
```

O mesmo para `playwright.download.prss.microsoft.com`. Nao ha Firefox
disponivel como pacote utilizavel na distribuicao base, e o Safari nao existe
para Linux em nenhuma forma.

Isto nao e um problema de configuracao que se resolva com mais tentativas. E
uma restricao do ambiente.

### Como completar a matriz

Duas vias, ambas prontas a usar.

**1. Testes automatizados, numa maquina com os browsers instalados**

```bash
npx playwright install firefox webkit
npm run build && npm run fixtures
npx playwright test --project=desktop --project=movel \
                    --project=firefox --project=webkit --project=iphone
```

`playwright.config.ts` declara cinco perfis: `desktop` e `movel` em Chromium,
que correm por defeito, e `firefox`, `webkit` e `iphone`, que exigem os binarios
respetivos. Sao 14 testes por perfil.

O perfil `iphone` usa o WebKit do Playwright com o viewport de um iPhone. Nao
substitui um iPhone real: nao tem os limites de memoria do dispositivo nem o
Safari de iOS.

**2. Pagina de diagnostico, em qualquer dispositivo real**

Necessaria para iPhone e iPad, onde o Playwright nao substitui o dispositivo:
o WebKit do Playwright nao e o Safari de iOS, e sobretudo nao tem os limites de
memoria de um telemovel.

```bash
npm run build
npx serve out          # ou qualquer servidor estatico
```

Abrir `http://<ip-da-maquina>/diagnostico.html` no dispositivo e premir
"Correr medicoes". No fim, copiar o bloco JSON e colar na seccao de resultados
deste documento.

A pagina reporta: capacidades do browser, versao e delegates do motor, tempo de
arranque, otimizacao no mesmo formato, varredura de qualidade, e a escada de
memoria com o degrau em que a conversao deixa de funcionar.

---

## Capacidades verificadas pela pagina de diagnostico

Cada linha existe porque ha codigo que falha sem ela. A criticidade diz o que
acontece se faltar.

| Capacidade | Criticidade | Se faltar |
|---|---|---|
| Web Worker de modulo | obrigatoria | nao ha conversao nenhuma |
| WebAssembly | obrigatoria | nao ha motor |
| `crypto.randomUUID` | obrigatoria | identificador de trabalho |
| `URL.createObjectURL` | obrigatoria | pre-visualizacao e descarregamento |
| atributo `download` em ancora | obrigatoria | o resultado abre em vez de ser guardado |
| `WebAssembly.instantiateStreaming` | importante | arranque mais lento |
| ArrayBuffer transferivel | importante | os bytes passam a ser copiados |
| `createImageBitmap` | importante | sem pre-visualizacao local |
| `canvas.toBlob` | importante | sem miniatura |
| CSS `:has()` | importante | a selecao nos controlos nao se ve |
| CSS `oklch()` | importante | a interface fica sem cor |
| opcoes de resize em `createImageBitmap` | opcional | miniatura mais pesada, ha alternativa |
| CSS container queries | opcional | tabelas mais apertadas |
| CSS `dvh` | opcional | altura instavel em telemovel |
| `CompressionStream` | opcional | so a pagina de diagnostico usa |
| `performance.memory` | opcional | so o diagnostico usa |

## Riscos especificos por motor, ainda nao verificados

Sao hipoteses fundamentadas nas APIs que usamos, nao resultados.

### Safari, macOS e iOS

1. **Encode de WebP em `canvas.toBlob`.** A miniatura pede WebP e conta com o
   browser devolver PNG quando nao sabe escrever WebP. Se em vez disso devolver
   `null`, a pre-visualizacao desaparece. O codigo trata `null` sem quebrar, mas
   o utilizador ficaria sem miniatura. **Por verificar.**
2. **Limite de memoria.** O Safari em iOS termina separadores com muito menos
   memoria que um portatil. A escada de memoria da pagina de diagnostico existe
   exatamente para descobrir onde. **Por medir.**
3. **Atributo `download`.** Historicamente o Safari em iOS ignorava-o e abria o
   ficheiro em vez de o guardar. A sonda verifica se o atributo existe, mas isso
   nao garante o comportamento. **Por verificar num iPhone.**
4. **Opcoes de resize em `createImageBitmap`.** Chegaram ao WebKit depois do
   resto. Sem elas a miniatura descodifica a imagem inteira, o que num telemovel
   pesa. Ha caminho alternativo implementado. **Por verificar.**

### Firefox

1. **Worker de modulo.** Chegou ao Firefox mais tarde que aos outros. Versoes
   atuais suportam, versoes antigas nao, e sem isto nao ha conversao.
   **Por verificar.**
2. **CSS `:has()`.** Chegou ao Firefox depois do Chromium e do Safari. Sem ele,
   a opcao selecionada nos controlos segmentados nao fica visivel.
   **Por verificar.**

### Todos os motores

**Nome do ficheiro descarregado com caracteres fora de ASCII.** Nao verificado.

Neste Chromium headless, um `<a download="ferias-cao.webp">` com acentos faz o
Playwright reportar o nome como `"download"`. Reproduzido com tres linhas de
HTML puro, sem codigo da aplicacao envolvido, e para acentos do portugues,
cirilico, CJK e emoji.

Nao sabemos se e a interceptacao de downloads do Playwright a sanitizar o nome,
ou o proprio Chromium headless. Um Chrome normal preserva nomes Unicode em uso
corrente, mas isso nao foi verificado aqui.

A logica de nomes esta coberta por testes unitarios, incluindo as formas NFC e
NFD, e o nome aparece corretamente na interface. **O que falta e abrir a
aplicacao num browser normal, descarregar uma imagem com acentos no nome, e
confirmar o nome do ficheiro guardado.** Um minuto de trabalho manual que este
ambiente nao permite.

Relacionado, e igualmente um obstaculo a testes: `setInputFiles` do Playwright
anexa **zero ficheiros**, em silencio e sem lancar excecao, para qualquer nome
com um carater fora de ASCII. Os testes que precisam de nomes Unicode
constroem o ficheiro dentro da pagina com `DataTransfer`.

O binario do motor tem 5,1 MB comprimidos. O tempo de arranque percebido depende
mais da rede do que do browser, mas a compilacao do modulo WebAssembly varia
entre motores. So medido no Chromium.

---

## Viewports

Testados em Chromium: 1440 e 390 px de largura, atraves dos perfis
`desktop` e `movel` do Playwright. Os pontos de rutura declarados no CSS sao
520, 768, 1024 e 1440 px.

Ainda nao verificados nos restantes valores exigidos pelo CLAUDE.md, seccao 21:
360, 768, 1024 e 1280 px.

---

## Resultados

### Chromium

Ver `docs/medicoes.md`. Todas as medicoes desta secao vieram deste browser.

### Firefox

Sem dados. Colar aqui o relatorio da pagina de diagnostico.

### Safari, macOS

Sem dados. Colar aqui o relatorio da pagina de diagnostico.

### Safari, iOS

Sem dados. Este e o caso mais importante que falta, porque e onde os limites de
memoria sao mais apertados e onde o comportamento do descarregamento e menos
previsivel.
