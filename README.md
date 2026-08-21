# Conversor de Imagens

Plataforma web de otimização e conversão de imagens. Todo o processamento
acontece no dispositivo do utilizador, através de WebAssembly num Web Worker.
Nenhuma imagem é enviada para um servidor.

Estado: primeira fatia vertical funcional. Suporta JPG, PNG e WebP.

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

npm run fixtures      # gera as imagens de teste
npm run test:e2e      # testes end to end, exige build e fixtures
```

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
docs/                  arquitetura, privacidade, formatos, medições
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
