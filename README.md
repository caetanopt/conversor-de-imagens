# Conversor de Imagens

Plataforma web de otimização e conversão de imagens. Todo o processamento
acontece no dispositivo do utilizador, através de WebAssembly num Web Worker.
Nenhuma imagem é enviada para um servidor.

Estado: núcleo funcional e validado. Suporta JPG, PNG, WebP e AVIF, em
conversão e em otimização no mesmo formato, com redimensionamento e controlo de
metadados. Falta o processamento em lote.

Validado em Chromium. **Firefox, Safari, iPhone e iPad continuam por validar**,
por o ambiente de desenvolvimento não permitir instalar esses browsers. Ver
`docs/browser-support.md`.

## Requisitos

- Node.js 22 ou superior

## Arrancar

```bash
npm install     # copia o binário do motor para public/magick/
npm run dev
```

O `postinstall` copia `magick.wasm` de `node_modules` para `public/magick/`.
O binário é servido da nossa própria origem e nunca de um CDN externo.

## Verificações

```bash
npm run verify        # typecheck + lint + testes unitários
npm run build         # build e exportação estática para out/
npm run verify:bundle # confirma que o motor não entra no bundle da main thread
npm run verify:all    # tudo o que está acima, em sequência

npm run fixtures      # gera as 24 imagens de teste, de forma reprodutível
npm run test:e2e      # testes end to end, exige build e fixtures
```

As fixtures são geradas e não versionadas. Incluem JPEG progressivo, JPEG com
EXIF e GPS, JPEG com perfil ICC AdobeRGB, JPEG CMYK, PNG com transparência,
ficheiros corrompidos, truncados, vazios, com extensão errada, sem extensão, e
com nome Unicode. Ver `docs/formatos.md`.

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
4. Selecionar uma imagem.
5. Converter a imagem.
6. Descarregar o resultado.
7. Confirmar que não existe qualquer pedido que contenha os bytes da imagem,
   o ficheiro completo, ou um upload multipart.

O que deve aparecer no painel: pedidos GET para ficheiros da própria origem,
incluindo `magick/magick.wasm`. Nada mais. Nenhum POST, nenhum corpo de
pedido, nenhum destino externo.

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
    download/          nomes de ficheiro e descarregamento
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
