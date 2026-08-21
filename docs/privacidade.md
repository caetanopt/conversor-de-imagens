# Privacidade

O processamento local não é uma mensagem de marketing, é uma propriedade da
arquitetura. Este documento lista os mecanismos que a sustentam e onde estão
no código.

A interface só pode afirmar que as imagens não saem do dispositivo enquanto
todos estes mecanismos estiverem no lugar.

## 1. Não existe onde receber um ficheiro

| Mecanismo | Onde |
|---|---|
| Exportação estática, sem runtime de servidor | `next.config.ts`, `output: 'export'` |
| Zero rotas de API e zero server actions | não existe nenhum `route.ts` no projeto |
| O binário do motor é servido da nossa origem | `scripts/copy-wasm.mjs`, `public/magick/` |

A exportação estática é a garantia mais forte disponível. Sem processo de
servidor, um endpoint de upload não pode existir nem por acidente.

## 2. Regras impostas por lint

Estas regras transformam uma violação num erro de build, em `eslint.config.mjs`.

**Proibido em `lib/image-engine`, `lib/files`, `lib/download`, `workers` e
`features/converter`:**

`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`,
`navigator.clipboard`, `localStorage`, `sessionStorage`, `indexedDB`,
`caches`, registo de service workers.

A proibição de `fetch` é absoluta e sem excepções porque o binário WASM é
carregado pela própria biblioteca `magick-wasm`, a partir de um URL passado
como parâmetro. Nenhum código nosso faz um pedido de rede.

**Proibido em todo o `src`, excepto num ficheiro:**

`URL.createObjectURL` e `URL.revokeObjectURL`. Só `lib/files/objectUrls.ts`
os pode chamar, para que cada criação tenha um revoke correspondente e isso
seja auditável num único sítio.

Nota sobre o flat config do ESLint: a mesma regra declarada em blocos
diferentes substitui, não acumula. A regra dos object URLs está repetida no
bloco das camadas sensíveis por essa razão. Isto foi apanhado ao testar as
regras com violações deliberadas, não por leitura do código.

## 3. Verificações automáticas

| Verificação | Ficheiro | O que garante |
|---|---|---|
| Nenhum pedido leva bytes | `tests/e2e/privacidade.spec.ts` | grava todos os pedidos durante o fluxo completo e falha se algum tiver corpo, não for GET, for multipart, ou sair da origem |
| Nada é guardado | `tests/e2e/privacidade.spec.ts` | `localStorage`, `sessionStorage`, `indexedDB`, Cache Storage e service workers vazios depois de uma conversão |
| Motor fora da main thread | `scripts/verificar-bundle.mjs` | o `initializeImageMagick` não aparece em nenhum chunk carregado pela página |
| Object URLs emparelhados | `tests/unit/objectUrls.test.ts` | nenhum URL fica pendente no fim de um fluxo |

O teste de rede tem uma contraprova deliberada: verifica que a página fez
pedidos de facto, incluindo `magick.wasm`. Sem isso passaria numa página que
não carregou nada.

## 4. Cabeçalhos recomendados no alojamento

A exportação é estática, portanto os cabeçalhos são configurados no serviço
de alojamento e não no código. Recomendado:

```
Content-Security-Policy: default-src 'self'; connect-src 'self'; form-action 'none'; object-src 'none'; base-uri 'self'
Cache-Control: public, max-age=31536000, immutable   (apenas para /magick/magick.wasm e /_next/static)
```

`connect-src 'self'` faz com que qualquer tentativa de enviar dados para
terceiros seja bloqueada pelo browser, e não apenas pela nossa disciplina.

Não é necessário cross-origin isolation. O binário do motor não usa
`SharedArrayBuffer`, `Atomics` nem pthreads, portanto não são precisos os
cabeçalhos COOP e COEP.

## 5. Higiene de memória

- Os `ArrayBuffer` são transferidos para o worker, não copiados, e ficam
  destacados na origem.
- O `File` nunca atravessa a fronteira do worker, apenas os bytes.
- O ficheiro é lido de novo em cada operação em vez de manter um buffer entre
  a inspeção e a conversão, para uma imagem de 100 MB não ficar retida em
  memória durante os minutos em que o utilizador escolhe definições.
- As miniaturas são geradas em dimensões limitadas. Nunca apontamos um `<img>`
  ao ficheiro original.
- As métricas de desenvolvimento em `lib/dev/metrics.ts` só registam formato,
  dimensão, tamanho e duração. Nunca nome de ficheiro nem EXIF, e não têm
  destino de rede.

## 6. Procedimento manual

Está no README, na secção "Teste manual de privacidade". Deve ser repetido à
mão sempre que o fluxo de conversão mudar, mesmo com o teste automático a
passar.
