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
| `src/app/icon.png` | o ícone: o monograma "C", fornecido diretamente (não vem do manual, ver abaixo) |
| `public/marca/fundo-caetano.webp` | a fotografia da marca, fornecida diretamente, fundo da zona de largar (ver abaixo) |

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

## Decisão que precisa de confirmação

**O estado de erro é laranja, porque a paleta não tem vermelho.**

O laranja dinâmico é a cor mais quente disponível. A alternativa era acrescentar
um vermelho, e um vermelho num sistema de azuis, cyan e verde seria a violação
de marca mais visível possível. Erro e aviso distinguem-se pelo tom, 69,5 contra
90,9 graus, e sempre por texto, nunca só pela cor. Se a marca tiver um vermelho
não publicado neste manual, muda-se `--state-danger` e `--state-danger-quiet`.

## O ícone e a fotografia de fundo não vêm do manual

O manual não define um símbolo isolado do lettering nem uma fotografia para
esta página. O ícone (`src/app/icon.png`, um monograma "C" com um acento cyan)
e a fotografia de fundo (`docs/brand/caetano.webp`, o nó rodoviário com o
lettering ao centro) foram fornecidos diretamente para este projeto, fora das
39 páginas do documento. Usados como estão, sem alteração: o CLAUDE.md, secção
14.4, proíbe inventar símbolos de marca, e o inverso, editar um símbolo já
fornecido, tem o mesmo problema.

Uma tentativa anterior de ícone, recortando uma letra do lettering para um
quadrado, tinha o problema oposto: ficava ilegível a 16 px porque a palavra
inteira tem uma proporção de 5,5:1. O monograma resolve isso, confirmado a
render: legível desde os 32 px, ainda reconhecível a 16.

## O fundo da zona de largar

A fotografia é gerada por `scripts/gerar-fundo-marca.mjs` a partir de
`docs/brand/caetano.webp`: só redimensiona e recomprime, sem cortar, espelhar
ou aplicar véu.

Uma primeira versão desta página usava um campo de cor liso extraído do
manual (página 38, secção 09.4 "Fundo") com um véu forte sobre o texto, uma
técnica que resolvia bem contra uma cor lisa. Contra esta fotografia, que tem
o lettering "caetano" bem definido e rastos de luz muito claros, um véu forte
o suficiente para garantir contraste (testado a 70 %) apagava o próprio
lettering e os rastos numa mancha achatada — o oposto do que a fotografia foi
escolhida para mostrar.

Por isso o texto já não assenta na fotografia. Assenta num painel,
`--field-painel`, envolvendo o título, o botão e a faixa inferior
(`DropZone.module.css`, classe `.painel`).

**O painel é translúcido, com desfoque por baixo, a pedido explícito.** A
primeira versão era opaca. A secção 13 do CLAUDE.md pede para evitar
glassmorphism como estilo por defeito, e aqui não é por defeito: é a escolha
do responsável do projeto para esta zona, para a fotografia se ver através em
vez de ficar tapada.

A garantia de contraste continua a não depender de nenhum pixel da imagem,
mesmo translúcida. `--field-painel` é 68 % de opacidade do azul profundo da
marca; `--field-painel-pior-caso`, usado só para derivar e testar, é essa
mesma mistura composta sobre o fundo mais claro concebível, branco puro.
Nenhum pixel real pode produzir um resultado mais claro do que isso por baixo
do painel, com ou sem desfoque. Os tokens de texto (`--field-text-*`,
`--field-line`) são resolvidos contra esse pior caso, e os pares vivem em
`tests/unit/contraste.test.ts` como qualquer outra superfície da aplicação. O
desfoque (`backdrop-filter: blur(24px)`) é só polimento visual, suaviza um
raio de luz nítido antes de chegar ao painel; a garantia matemática já vale
sem ele. 68 % é o mínimo matemático (63,9 %) mais uma margem pequena: descer
mais perderia a garantia com texto branco puro sobre um pixel branco puro.

A moldura tracejada exterior da zona (`--field-line`, ou branca sólida a
arrastar um ficheiro) continua sobre a fotografia diretamente, sem véu nem
painel por baixo, e essa não tem a mesma garantia: 3:1 contra qualquer pixel
exigiria véu de novo. Aceita-se aqui um risco residual, coberto por três
sinais redundantes que não dependem da fotografia — o painel, o botão
"Selecionar ficheiros" e o enquadramento da página. `tests/unit/
contraste.test.ts` documenta esta exceção explicitamente em vez de fingir
uma garantia que não existe.

**Ecrãs mais altos do que largos precisaram de um ajuste à parte.** Com
`background-size: cover`, uma caixa em retrato mostra uma fatia vertical fina
da fotografia; como o lettering ocupa quase toda a largura da imagem, essa
fatia cortava a meio de letras. `DropZone.module.css`, sob
`@media (max-aspect-ratio: 3/4)`, deixa a altura da zona vir do conteúdo do
painel em vez de esticar para preencher o ecrã, e o painel passa a tocar as
duas bordas em vez de deixar uma margem onde um pedaço de letra podia
aparecer. A condição é a proporção do ecrã, não uma largura fixa: uma janela
de desktop estreita e alta tem o mesmo problema que um telemóvel.

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
