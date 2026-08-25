# Conversor de Imagens

Plataforma web de otimização e conversão de imagens. Todo o processamento
acontece no dispositivo do utilizador, através de WebAssembly num Web Worker.
Nenhuma imagem é enviada para um servidor.

Estado: primeira versão completa em âmbito. Suporta JPG, PNG, WebP, AVIF, GIF,
BMP, TIFF e ICO, em conversão e em otimização no mesmo formato, com
redimensionamento,
controlo de metadados, processamento em lote com concorrência controlada e
descarregamento de vários resultados num ZIP criado no browser.

A animação de um GIF ou de um WebP é preservada quando o formato de destino a
suporta. Quando não suporta, a interface diz o que se vai perder antes de
converter, e sugere um formato que a mantenha.

Em WebP existe também compressão sem perda, que preserva os pixéis exatamente à
custa de um ficheiro bastante maior. Os formatos que já são sem perda por
natureza não mostram a opção, porque não haveria nada a escolher.

Validado em Chromium. **Firefox, Safari, iPhone e iPad continuam por validar**,
por o ambiente de desenvolvimento não permitir instalar esses browsers. Ver
`docs/browser-support.md`.

## Requisitos

- Node.js 22 ou superior, declarado em `engines` para o alojamento escolher a
  versão certa no build

## Arrancar

```bash
npm install     # copia o binário do motor para public/magick/
npm run dev
```

O `postinstall` copia `magick.wasm` de `node_modules` para `public/magick/`.
O binário é servido da nossa própria origem e nunca de um CDN externo.

## Verificações

```bash
npm run verify        # typecheck + lint + testes unitários, incluindo contraste
npm run build         # build e exportação estática para out/
npm run verify:bundle # confirma que o motor não entra no bundle da main thread
npm run verify:all    # tudo o que está acima, em sequência

npm run fixtures      # gera as 24 imagens de teste, de forma reprodutível
npm run test:e2e      # testes end to end, exige build e fixtures
```

O `verify` inclui o teste de contraste dos tokens de cor, e o `test:e2e` inclui
a verificação das seis larguras da secção 21 do CLAUDE.md.

As fixtures são geradas e não versionadas. Incluem JPEG progressivo, JPEG com
EXIF e GPS, JPEG com perfil ICC AdobeRGB, JPEG CMYK, PNG com transparência,
ficheiros corrompidos, truncados, vazios, com extensão errada, sem extensão, e
com nome Unicode. Ver `docs/formatos.md`.

## Publicar

O `npm run build` produz `out/`, um site estático. Não é necessário nenhum
runtime de servidor, nenhuma variável de ambiente e nenhum cabeçalho especial:
o motor é single-threaded e não precisa de COOP/COEP.

O binário do motor não está no repositório. É o `postinstall` que o copia de
`node_modules` para `public/magick/`, portanto qualquer alojamento que corra
`npm install` antes do build fica com ele. Verificado nessa ordem exata.

Serve em qualquer alojamento estático. No Vercel funciona sem configuração:
importar o repositório e publicar, sem `vercel.json` e sem alterar nada. Em
alojamento num subcaminho, como GitHub Pages em `utilizador.github.io/repo`,
seria necessário acrescentar `basePath` ao `next.config.ts`.

A suite end to end é a prova de que não existe dependência de plataforma: serve
o `out/` com `python3 -m http.server`, um servidor de ficheiros sem qualquer
noção de Next.js.

## Diagnóstico em dispositivos reais

```bash
npm run build
npx serve out
```

Abrir `/diagnostico.html` no dispositivo a testar e premir "Correr medições".
A página reporta capacidades do browser, informação do motor, otimização no
mesmo formato, varredura de qualidade, e uma escada de dimensões que sobe até a
conversão falhar. No fim produz um relatório JSON para colar em
`docs/browser-support.md`.

É a via para validar Safari e iOS, onde não é possível instalar um browser de
teste automatizado.

## Teste manual de privacidade

Este procedimento está automatizado em `tests/e2e/privacidade.spec.ts`, mas
deve ser repetido à mão sempre que o fluxo de conversão mudar.

1. Abrir as ferramentas de desenvolvimento do browser.
2. Abrir o painel Network.
3. Limpar a lista de pedidos.
4. Selecionar várias imagens.
5. Converter tudo.
6. Descarregar um resultado individual.
7. Descarregar todos os resultados em ZIP.
8. Confirmar que não existe qualquer pedido que contenha os bytes de nenhuma
   imagem, um ficheiro completo, o ZIP, ou um upload multipart.

O ZIP é o passo que mais parece exigir um servidor e não exige: é montado em
memória pelo `fflate` e entregue como um `Blob` local.

O que deve aparecer no painel: pedidos GET para ficheiros da própria origem,
incluindo `magick/magick.wasm` e o `.woff2` da Montserrat. Nada mais. Nenhum
POST, nenhum corpo de pedido, nenhum destino externo. Em particular, nenhum
pedido a `fonts.googleapis.com` nem a `fonts.gstatic.com`: a tipografia da
marca está no repositório precisamente para não haver.

Verificar também o armazenamento, no painel Application:

9. Abrir Application e ver Local Storage, Session Storage, IndexedDB e Cache
   Storage.
10. Depois de converter, tudo tem de estar vazio.
11. Carregar no botão de tema e confirmar que aparece no máximo uma chave,
    `conversor:tema`, com o valor `claro` ou `escuro`. Voltar a **Automático**
    apaga-a. Não pode existir mais nada.

Se este procedimento falhar, a afirmação de processamento local deixa de ser
verdadeira e tem de ser removida da interface.

## Metadados

Por defeito, uma conversão remove EXIF, GPS, XMP e IPTC, e mantém apenas o
perfil de cor ICC.

Não é um compromisso arbitrário. Remover o perfil muda a imagem de forma
visível: um vermelho AdobeRGB de RGB(220,30,40) precisa de RGB(255,29,40) para
ter o mesmo aspeto em sRGB, e sem o perfil o browser mostra os números crus. Um
perfil ICC descreve cor, não a pessoa: não tem data, localização, autor nem
número de série. Preservá-lo custou 570 bytes medidos.

As três políticas estão na interface, e a que remove tudo avisa que as cores
podem mudar. Ver `docs/privacidade.md`.

## Como está organizado

```
src/
  app/                 casca da aplicação
  components/          componentes próprios, sem design system externo
  features/converter/  domínio do conversor: estado, hooks, componentes
  lib/
    image-engine/      contrato do motor, opções, adapter do ImageMagick
    files/             leitura, assinatura, object URLs, miniaturas
    download/          nomes de ficheiro, descarregamento e ZIP local
    validation/        limites e validação de entrada
    format/            formatação de bytes, dimensões e percentagens
  workers/             image.worker.ts, o único sítio onde o motor corre
  config/              formatos, limites, presets, identidade do motor
  styles/              tokens, tipografia, movimento
  features/diagnostico/ página interna de validação, fora do produto
docs/                  arquitetura, privacidade, formatos, medições, browsers
tests/                 unitários, end to end, fixtures
```

Documentação mais detalhada em `docs/`.

## Identidade visual

O manual de identidade da marca ainda não foi fornecido. Todos os valores
visuais em `src/styles/tokens.css` são provisórios e estão assinalados como
tal. Nenhum componente escreve uma cor, um tipo de letra, um raio ou um
espaçamento literal: tudo lê variáveis CSS.

Quando o manual existir, deve ser colocado em `docs/brand/` e lido antes de
qualquer trabalho visual.
