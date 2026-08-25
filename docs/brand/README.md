# Marca

O manual de identidade está em `Manual_Identidade_Caetano_042026.pdf`. É a
fonte para decisões de cor, tipografia, grelha, espaçamento, iconografia,
raios e movimento.

Em caso de conflito com o CLAUDE.md em matéria visual, o manual prevalece. As
regras de privacidade, arquitetura e âmbito continuam a prevalecer, salvo
alteração explícita do responsável do projeto.

## O que está aplicado

| Onde | O que veio do manual |
|---|---|
| `src/styles/tokens.css` | a paleta completa, nos valores exatos do documento: as duas primárias, as duas neutras, as seis secundárias e os quatro tints de cada cor com escala publicada |
| `src/styles/typography.css` | Montserrat, e o peso forte a 700 porque o manual especifica Bold |
| `src/styles/fontes/` | o ficheiro `.woff2` da Montserrat, servido da nossa origem |
| `src/components/brand/CaetanoLettering.tsx` | o lettering horizontal, extraído em vetor da página 7 |
| `src/app/icon.svg` | o ícone, com o tratamento quadrado que o manual usa para avatares na página 36 |

O `tokens.css` tem duas camadas, e a distinção é deliberada:

1. **A paleta** (`--marca-*`) são os valores publicados, em hexadecimal, iguais
   aos do documento, para poderem ser confrontados com o manual sem conversão
   pelo meio. `tests/unit/contraste.test.ts` verifica cada um.
2. **Os tokens semânticos** são o que os componentes leem. Apontam para a
   paleta sempre que o valor do manual serve, e são derivados em oklch quando
   não serve, mantendo o tom da marca e resolvendo só a luminosidade.

A razão para derivar: um manual de identidade define uma paleta para aplicação
gráfica, não um tema de interface. As cores de apoio estão entre 70 % e 88 % de
luminosidade e nenhuma atinge 4,5:1 como texto sobre branco. O verde dá 2,57:1,
o laranja 1,91:1 e o amarelo 1,44:1. Usá-las tal e qual em texto seria trocar
legibilidade por fidelidade cromática, contra a secção 20 do CLAUDE.md. Cada
derivação tem comentário no ficheiro a dizer o valor medido.

## Decisões que precisam de confirmação

Duas coisas foram decididas por omissão do manual. Ambas são reversíveis num
único ficheiro.

**1. O estado de erro é laranja, porque a paleta não tem vermelho.**

O laranja dinâmico é a cor mais quente disponível. A alternativa era acrescentar
um vermelho, e um vermelho num sistema de azuis, cyan e verde seria a violação
de marca mais visível possível. Erro e aviso distinguem-se pelo tom, 69,5 contra
90,9 graus, e sempre por texto, nunca só pela cor. Se a marca tiver um vermelho
não publicado neste manual, muda-se `--state-danger` e `--state-danger-quiet`.

**2. O ícone é o lettering sobre azul profundo, e a 16 px não se lê.**

O manual não define um símbolo que funcione isolado do lettering. A versão
vertical da página 7 seria mais próxima de um quadrado, mas o manual restringe-a
explicitamente: "Só deve ser utilizada em bandeirolas". A `caetano`
tem sete letras com uma proporção de cerca de 5,5:1, e num quadrado de 16 px
fica uma mancha; torna-se legível por volta dos 48 px. Recortar uma letra para
fazer um símbolo seria inventar uma marca, o que o CLAUDE.md, secção 14.4,
proíbe. Se existir um símbolo ou monograma fora deste documento, é o que deve
entrar em `src/app/icon.svg`.

## Tema escuro

O manual não o define. É derivado, com duas regras:

- os fundos ficam no tom do azul profundo, 253,9 graus, com croma muito baixo,
  para o escuro pertencer à marca em vez de ser um preto neutro;
- as cores de estado passam a usar os tints t1 do manual, que são a versão
  clara publicada de cada cor, e por isso ficam bem acima do limiar sobre fundo
  escuro.

O acento inverte-se: azul profundo no tema claro, cyan no escuro. O azul
profundo tem 30,3 % de luminosidade e sobre um cartão a 22 % ficaria invisível.
As duas são valores exatos do manual, portanto a inversão não sai da paleta.

## Regras do manual a respeitar em trabalho futuro

- O lettering não pode ser substituído por uma fonte parecida. Usar sempre
  `CaetanoLettering`, que são os contornos reais (página 8).
- Altura mínima do lettering em digital: 14 px (página 6).
- Manter a área de segurança em volta do lettering (página 6).
- Aptos é para assinaturas de email, não para a aplicação (página 16).
- A versão vertical do logótipo serve apenas bandeirolas. A horizontal é sempre
  a primeira opção (página 7).

## Nota sobre a leitura da paleta

A página 11 mostra dez amostras nomeadas; a página 12 publica o código
hexadecimal de sete delas com os respetivos tints. Os três nomes que faltavam
foram lidos diretamente do preenchimento dos quadrados da página 11:

| Nome no manual | Valor | Nota |
|---|---|---|
| ultra branco | `#ffffff` | cor neutra |
| azul céu | `#99dff9` | coincide com o terceiro tint do azul cyan |
| verde pastel | `#a8d5ba` | cor própria, não pertence à escala de tints do verde eco |

Ambas as coincidências têm teste em `tests/unit/contraste.test.ts`, para o caso
de uma revisão futura do manual as separar.
