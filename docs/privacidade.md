# Privacidade

O processamento local não é uma mensagem de marketing, é uma propriedade da
arquitetura. Este documento lista os mecanismos que a sustentam, onde estão no
código, e o que foi verificado.

A interface só pode afirmar que as imagens não saem do dispositivo enquanto
todos estes mecanismos estiverem no lugar.

---

## A afirmação, e o que a sustenta

> Nenhum byte das imagens selecionadas pelo utilizador é enviado através da rede.

Isto é verificável e está verificado. Três camadas independentes:

**1. Não existe onde receber um ficheiro.** A aplicação é exportada como site
estático (`output: 'export'` em `next.config.ts`). Não há processo de servidor,
portanto não pode existir um endpoint de upload, nem por acidente. Não há
nenhum `route.ts` no projeto e não há server actions.

**2. Nenhum código nosso pode fazer um pedido de rede** nas camadas que tocam
nos bytes. Imposto por lint, ver abaixo. O binário do motor é carregado pela
própria biblioteca `magick-wasm` a partir de um URL da nossa origem, o que
permite que a proibição seja absoluta e sem exceções.

**3. Um teste executa o fluxo completo e inspeciona todos os pedidos.** Verifica
que nenhum tem corpo, que nenhum sai da nossa origem, e procura ativamente
representações dos bytes da imagem em cada URL e em cada corpo.

---

## O ZIP é criado no dispositivo

De todo o fluxo, o descarregamento de vários resultados num ZIP é o passo que
mais parece exigir um servidor. Não exige.

O `fflate` monta o arquivo em memória a partir dos `Blob` que já estão no
browser, e o resultado é entregue por um `blob:` da nossa própria origem, como
qualquer descarregamento individual. Não existe serviço de compressão remoto,
não existe endpoint de empacotamento, e nenhum byte atravessa a rede.

Três decisões com consequência para privacidade:

- **Sem compressão.** `level: 0`. Os ficheiros já são JPEG, PNG, WebP ou AVIF.
  A razão principal é de desempenho, mas tem um efeito lateral útil: menos
  trabalho sobre os bytes do utilizador.
- **Sem carimbo temporal no nome.** O ZIP chama-se `3-imagens-convertidas.zip`
  e não inclui data nem hora. Um carimbo revelaria quando o utilizador
  processou as imagens, que é o tipo de dado que a política de metadados remove
  dos ficheiros. O teste unitário verifica o determinismo do nome.
- **Nomes de origem resolvidos, não descartados.** Dois ficheiros que produzem
  o mesmo nome de saída ficam `foto.webp` e `foto-2.webp`. Sem isto o ZIP
  perdia uma entrada em silêncio.

O teste `tests/e2e/lote.spec.ts` converte três imagens, descarrega o ZIP,
volta a abri-lo em Node, confirma que as três entradas são WebP válidos, e
verifica no mesmo teste que nenhum pedido de rede levou corpo e que nada saiu
da nossa origem.

## Inventário completo de pedidos de rede

Durante a utilização normal, do primeiro carregamento até ao descarregamento do
resultado, os pedidos são **exatamente** estes. Todos GET, todos para a nossa
própria origem, nenhum com corpo.

| Pedido | Quando | Porquê |
|---|---|---|
| `/` | primeiro carregamento | o documento HTML |
| `/_next/static/chunks/*.css` | primeiro carregamento | folhas de estilo |
| `/_next/static/chunks/*.js` | primeiro carregamento | código da aplicação, sem o motor |
| `/favicon.ico` | primeiro carregamento | pedido automático do browser |
| `/_next/static/chunks/turbopack-worker-*.js` | ao escolher a primeira imagem | arranque do worker |
| `/_next/static/chunks/*.js` (chunk do motor) | ao escolher a primeira imagem | o adaptador do ImageMagick, dentro do worker |
| `/magick/magick.wasm?v=<versão>` | ao escolher a primeira imagem | o binário do motor, 5,1 MB comprimidos |

Depois disto **não há mais nenhum pedido de rede**. A inspeção, a conversão, a
pré-visualização e o descarregamento acontecem sem tocar na rede.

Dois esquemas locais aparecem no painel de rede do browser e podem ser
confundidos com pedidos:

| Esquema | Uso | Sai do dispositivo |
|---|---|---|
| `blob:<nossa origem>/…` | miniatura e início do descarregamento | não, por construção |
| `data:` | não usado atualmente | não, por construção |

Um `blob:` é uma referência a memória do próprio browser. Não existe socket, não
existe servidor, e o teste verifica que qualquer `blob:` pertence à nossa
origem.

**O que nunca aparece:** nenhum CDN, nenhum tipo de letra externo, nenhum
serviço de analytics, nenhuma imagem de terceiros, nenhum POST, nenhum
`multipart/form-data`, nenhum WebSocket.

Um teste dedicado, `o inventario de pedidos e exatamente o documentado`, falha
se um pedido novo aparecer no fluxo. Esta tabela não pode envelhecer em
silêncio.

---

## Regras impostas por lint

Em `eslint.config.mjs`. Uma violação é um erro de build, não uma nota de
revisão.

**Proibido em `lib/image-engine`, `lib/files`, `lib/download`, `workers` e
`features/converter`:**

`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`,
`navigator.clipboard`, `localStorage`, `sessionStorage`, `indexedDB`, `caches`,
registo de service workers.

**Proibido em todo o `src`, com uma única exceção:**

`URL.createObjectURL` e `URL.revokeObjectURL`. Só `lib/files/objectUrls.ts` os
pode chamar, para que cada criação tenha um revoke correspondente e isso seja
auditável num único sítio.

Duas notas sobre estas regras, ambas descobertas ao testá-las com violações
deliberadas em vez de as ler:

1. **No flat config do ESLint, a mesma regra num bloco posterior substitui, não
   acumula.** A regra dos object URLs tem de ser repetida no bloco das camadas
   sensíveis. Sem isso, ficheiros em `features/converter` perdiam-na em
   silêncio. Quatro de cinco violações eram detetadas; agora são cinco de cinco.
2. **A sonda de capacidades não abre exceção.** O diagnóstico precisa de saber
   se `createObjectURL` existe, e verifica-o com `'createObjectURL' in URL` em
   vez de acesso ao membro. A regra continua sem exceções.

---

## Verificações automáticas

| Verificação | Ficheiro | O que garante |
|---|---|---|
| Nenhum pedido leva bytes | `tests/e2e/privacidade.spec.ts` | nenhum pedido com corpo, não GET, multipart, ou fora da origem |
| Nenhuma representação dos bytes | idem | três janelas de 24 bytes do ficheiro, em latin1, base64 e hexadecimal, procuradas em todos os URLs e corpos |
| O inventário está correto | idem | falha se aparecer um pedido fora da tabela acima |
| Nada é guardado | idem | `localStorage`, `sessionStorage`, `indexedDB`, Cache Storage e service workers vazios depois de converter |
| Metadados privados removidos | idem | procura GPS, número de série, autor e localidade no ficheiro **descarregado** |
| Motor fora da main thread | `scripts/verificar-bundle.mjs` | `initializeImageMagick` não aparece em nenhum chunk carregado pela página |
| Object URLs emparelhados | `tests/unit/objectUrls.test.ts` | nenhum URL fica pendente no fim de um fluxo |
| Metadados ao nível dos bytes | `tests/unit/fixtures.test.ts` | sete dados privados confirmados presentes no original e ausentes na saída |
| O ZIP é local | `tests/e2e/lote.spec.ts` | três imagens convertidas e empacotadas sem um único pedido com corpo |
| O lote não mente | idem | um lote com falhas nunca se apresenta como concluído |

A procura por conteúdo tem uma contraprova deliberada: verifica que as janelas
de bytes existem de facto no ficheiro de origem. Sem isso, passaria com agulhas
vazias. O mesmo para o teste de rede, que confirma que a página fez pedidos,
incluindo o do binário do motor.

---

## Decisão sobre metadados

Três políticas, e a razão de cada uma. O valor por defeito é **`preservar-cor`**.

| Política | O que faz | Quando escolher |
|---|---|---|
| **`preservar-cor`**, por defeito | Remove EXIF, GPS, XMP, IPTC e 8BIM. Mantém apenas o perfil ICC. | Quase sempre. Os dados pessoais saem, a imagem continua com o aspeto certo. |
| `remover` | Remove tudo, incluindo o perfil de cor. | Quando cada byte conta e a imagem já está em sRGB. |
| `manter` | Não remove nada. | Escolha explícita, por exemplo para arquivo pessoal. |

### O que é considerado privado, e é removido

| Tipo | Contém | Removido por defeito |
|---|---|---|
| EXIF | data e hora de captura, fabricante, modelo, número de série do corpo, definições da objetiva | sim |
| EXIF GPS | latitude, longitude, altitude, referência de direção | sim |
| XMP | autor, direitos, cidade, histórico de edição, identificadores de documento | sim |
| IPTC | autor, legenda, palavras-chave, localidade, agência | sim |
| 8BIM, Photoshop | contentor de IPTC e dados de aplicação | sim |

Verificado ao nível dos bytes, e não pela lista de perfis. Ver
`docs/medicoes.md`, secção de metadados.

### Porque o perfil de cor não é removido

Um perfil ICC descreve o espaço de cor. Não contém data, nem localização, nem
autor, nem número de série. O que pode conter é o nome do espaço, por exemplo
"Display P3" ou "Adobe RGB (1998)", e ocasionalmente o modelo de um monitor.
É informação sobre cor, não sobre a pessoa, e é incomparavelmente mais fraca
do que uma coordenada GPS.

Do outro lado da balança, remover o perfil muda a imagem de forma visível.
Medido num vermelho saturado em AdobeRGB:

| Estado | Valor RGB |
|---|---|
| com o perfil, como é apresentado | 220, 30, 40 |
| transformado corretamente para sRGB | **255, 29, 40** |
| perfil removido, sem transformar | 220, 30, 40, interpretado como sRGB |

Sem o perfil, o browser assume sRGB e apresenta os números crus. Uma diferença
de 35 no canal vermelho vê-se: o vermelho fica mais mate. Não é uma perda
teórica.

**A alternativa que foi considerada e rejeitada por agora:** transformar para
sRGB e depois remover tudo. Daria o ficheiro mais pequeno com o aspeto correto,
mas exige embutir um perfil sRGB na aplicação e, sobretudo, **recorta as cores
fora do gamut sRGB de forma definitiva**. Uma imagem em Display P3 perderia
cores que o sRGB não representa. Preservar o perfil não perde nada e custa
570 bytes medidos. Se um dia houver procura por ficheiros ainda mais pequenos,
a conversão para sRGB entra como opção avançada explícita, nunca como
comportamento por defeito.

### A hora da conversão nunca entra no ficheiro

O motor acrescenta atributos `date:create`, `date:modify` e `date:timestamp` com
a hora da leitura, e o escritor de PNG grava-os em chunks `tEXt`. Não são
metadados do utilizador: são gerados por nós.

Com a política `manter`, isso significaria acrescentar ao ficheiro uma data que
o original não tinha, revelando quando o utilizador processou a imagem. São
removidos em **todas** as políticas, e um teste verifica-o para as três.

Efeito secundário útil: a saída passou a ser reproduzível byte a byte, o que
também torna as fixtures de teste reprodutíveis.

### A ordem das operações não é negociável

`autoOrient()` **antes** de `strip()`. A orientação vive no EXIF. Se o EXIF
fosse apagado primeiro, a rotação perdia-se e a imagem saía deitada. Imposto em
`aplicarDiretivas` e coberto por um teste que verifica que uma imagem 400x300
com orientação 6 sai 300x400, mais a contraprova de que sem `autoOrient` sairia
400x300.

### Um detalhe do motor que causou um bug real

O objeto devolvido por `getProfile('icc')` **não sobrevive ao `strip()`**. É uma
vista sobre a memória da imagem. Guardá-lo e reutilizá-lo depois lança
`ColorspaceColorProfileMismatch`, e de forma dependente do estado do heap: em
isolamento passa, depois de uma imagem grande ter sido descodificada falha.

A primeira implementação fazia exatamente isso. Foi apanhada pelos testes das
fixtures, não por leitura do código. Os bytes do perfil são agora copiados de
imediato, antes do strip.

---

## Cabeçalhos recomendados no alojamento

A exportação é estática, portanto os cabeçalhos configuram-se no serviço de
alojamento e não no código.

```
Content-Security-Policy: default-src 'self'; connect-src 'self'; form-action 'none'; object-src 'none'; base-uri 'self'
Cache-Control: public, max-age=31536000, immutable   (apenas /magick/magick.wasm e /_next/static)
```

`connect-src 'self'` faz com que qualquer tentativa de enviar dados para
terceiros seja bloqueada pelo browser, e não apenas pela nossa disciplina.

**Não é necessário cross-origin isolation.** O binário do motor não usa
`SharedArrayBuffer`, `Atomics` nem pthreads, verificado por inspeção do pacote,
portanto os cabeçalhos COOP e COEP não são precisos.

---

## Higiene de memória

- Os `ArrayBuffer` são transferidos para o worker, não copiados, e ficam
  destacados na origem.
- O `File` nunca atravessa a fronteira do worker, apenas os bytes.
- O ficheiro é lido de novo em cada operação em vez de manter um buffer entre a
  inspeção e a conversão, para uma imagem de 100 MB não ficar retida em memória
  durante os minutos em que o utilizador escolhe definições.
- As miniaturas são geradas em dimensões limitadas. Nunca apontamos um `<img>`
  ao ficheiro original.
- O worker é substituído depois de processar uma imagem acima de 8 MP, porque a
  memória linear do WASM nunca encolhe.
- As métricas de desenvolvimento em `lib/dev/metrics.ts` registam formato,
  dimensão, tamanho e duração. Nunca nome de ficheiro nem EXIF, e não têm
  destino de rede.

---

## Mensagens de erro

O texto do motor **nunca** chega ao utilizador. Uma versão anterior mostrava
`erro.detail`, o que punha coisas como
`NoDecodeDelegateForThisImageFormat @ error/blob.c/ImagesToBlob/2477` no ecrã.
Isso não ajuda ninguém, parece uma falha do produto, e revela detalhes de
implementação.

O detalhe técnico fica reservado ao registo de desenvolvimento, que desaparece
em produção. `classificarErroDoMotor` traduz cada falha numa mensagem em
Português e numa sugestão de ação, e um teste verifica sobre as mensagens reais
das fixtures que nenhuma contém nomes de exceção, caminhos de ficheiro,
endereços hexadecimais, ou as palavras "wasm", "magick" ou "ImageMagick".

---

## Procedimento manual

Continua no README, e deve ser repetido à mão sempre que o fluxo de conversão
mudar, mesmo com o teste automático a passar. O teste verifica o que sabemos
verificar; a inspeção manual pode notar o que não pensámos em testar.
