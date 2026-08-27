# Controlo de acesso

O conversor é uma ferramenta interna: só a equipa Caetano deve conseguir abri-lo.

Este documento explica como isso é feito, porque foi feito assim, e como se
mantém. A configuração em si vive na conta Cloudflare, não no repositório, e é
de propósito: não há segredos aqui dentro para gerir nem para deixar escapar.

---

## A decisão

**O acesso é restringido no edge, à frente do site, e não com um ecrã de login
dentro da aplicação.**

O pedido é travado antes de chegar aos ficheiros. Quem não estiver autorizado
nunca recebe o HTML, o JavaScript nem o binário do motor.

Foi esta a escolha por cinco razões concretas:

1. **A aplicação continua a ser um export estático.** O `output: 'export'` do
   `next.config.ts` é uma decisão de privacidade: sem runtime de servidor não
   pode existir um endpoint de upload, nem por engano. Um login próprio
   obrigaria a acrescentar servidor e trocaria essa garantia estrutural por uma
   promessa mantida por disciplina.
2. **Não é preciso base de dados.** A política é "email a terminar em
   `@caetano.pt`", uma regra e não uma tabela de utilizadores.
3. **Não há segredos no repositório nem em variáveis de ambiente.** Nada de
   chaves de assinatura, nada de credenciais de provedor de email.
4. **Não há rotas de login nem de registo** dentro do produto, o que mantém o
   critério de aceitação do `CLAUDE.md`, secção 28.
5. **Zero linhas de código.** Nada a manter, nada que possa ter um bug.

### O que foi rejeitado, e porquê

Um *magic link* próprio, com token assinado e sem base de dados, é tecnicamente
possível e foi ponderado. Ficou de fora porque exigiria runtime de servidor, um
segredo de assinatura para guardar e rodar, um provedor de email contratado, e
mitigações a sério para três problemas que a ausência de estado traz: links não
podem ser marcados como usados, sessões não podem ser revogadas antes de
expirar, e não há contador para limitar pedidos.

Para o objetivo real, "só entra gente da casa", pagava-se tudo isso sem
benefício nenhum.

**Não usar `localStorage` para isto.** Num site estático, uma verificação feita
pelo próprio JavaScript da página não é controlo de acesso: os ficheiros já
foram entregues, e qualquer pessoa os obtém com um `curl` ou escreve a chave à
mão no devtools. O que protege é o servidor recusar-se a servir, que é
exactamente o que esta montagem faz.

---

## Configuração

**Pré-requisito:** o domínio tem de passar pela Cloudflare, ou seja DNS na
Cloudflare com o proxy ativo (nuvem laranja). Se o site estiver alojado em
Cloudflare Pages, já está.

São duas partes, e **a ordem importa**. O método de login configura-se ao nível
da conta, e não dentro da aplicação. Criar a aplicação primeiro leva ao erro
descrito no fim desta secção.

### Parte A: método de login, uma vez por conta

Uma organização Zero Trust nova traz como método de login por defeito o
**Cloudflare identity provider**. O **One-time PIN já não é adicionado
automaticamente**, ao contrário do que acontecia antes: tem de ser ligado à mão.

1. Cloudflare Dashboard → **Zero Trust**
2. **Integrations → Identity providers**
3. **Add new identity provider**
4. Escolher:
   - **One-time PIN**, se a equipa não tiver fornecedor de identidade. É um
     código enviado por email e não exige montar mais nada.
   - **Google Workspace** ou **Microsoft Entra ID**, se a empresa já usar um
     deles. É preferível: quem sai da empresa perde o acesso no mesmo momento
     em que perde a conta, sem ninguém ter de se lembrar de o retirar aqui.

### Parte B: a aplicação

5. **Access → Applications → Add an application → Self-hosted**
6. **Application name:** `Conversor de Imagens`
7. **Session Duration:** `1 week` (ver a nota abaixo)
8. **Application domain:** o domínio ou subdomínio onde o conversor está
9. **Policies → Add a policy:**
   - **Policy name:** `Equipa Caetano`
   - **Action:** `Allow`
   - **Include:** `Emails ending in` → `@caetano.pt`
10. Métodos de login aceites: por defeito vem **Accept all available identity
    providers**, que serve. Se quiser restringir a um só, desmarcar essa opção e
    escolher da lista os que foram configurados na Parte A.
11. **Save.**

### O erro que a inversão da ordem provoca

Se a aplicação for criada sem o One-time PIN estar configurado na Parte A, a
política aceita o email mas **o código nunca chega**, porque o Access só envia
PIN se esse método de login existir na conta. Parece avaria de entrega de email
e não é: é um método de login em falta.

Confirmar os limites do escalão gratuito antes de contar com ele. Historicamente
cobre equipas pequenas, na ordem das dezenas de utilizadores, mas os planos
mudam.

---

## O furo mais comum nesta montagem

Se o site estiver alojado noutro sítio, por exemplo Vercel ou Netlify, e só o
DNS passar pela Cloudflare, **o domínio próprio do alojamento continua público**.
O Access protege o hostname que está à frente dele, e não a origem: uma pessoa
que descubra `projeto.vercel.app` entra sem passar por nada.

Duas saídas, por ordem de preferência:

1. **Alojar em Cloudflare Pages.** Não existe origem pública separada, portanto
   o problema desaparece.
2. **Fechar também a origem.** Na Vercel, ativar *Deployment Protection*. Em
   alternativa, restringir a origem aos IPs da Cloudflare.

Verificar isto explicitamente depois de configurar. É o passo que se esquece.

---

## Gerir quem entra

- **A equipa toda:** a política do domínio `@caetano.pt` cobre todos. Entra e
  sai gente sem tocar na configuração.
- **Exceções pontuais**, uma agência ou um freelancer: acrescentar um
  `Include → Emails` com os endereços exactos. Não abrir o domínio deles
  inteiro.
- **Retirar acesso a alguém:** se perder o email da empresa, deixa de entrar na
  sessão seguinte. Para expulsar de imediato, **Zero Trust → Access → revogar
  as sessões** desse utilizador.

### Duração da sessão

`1 week` é o compromisso recomendado. Mais curto incomoda quem usa a ferramenta
todos os dias; mais longo alarga a janela de um portátil perdido.

O risco de uma sessão aberta aqui é menor do que o habitual: a aplicação não
guarda ficheiros nem histórico, portanto uma sessão indevida dá acesso à
ferramenta, não a imagens de ninguém.

---

## Verificar que ficou a funcionar

Sem autorização, nenhum destes pode devolver `200` com conteúdo da aplicação:

```bash
DOMINIO=https://o-dominio-escolhido

# O HTML. Espera-se 302 para o ecrã do Access.
curl -sS -o /dev/null -w '%{http_code}\n' "$DOMINIO/"

# O binário do motor, 5 MB. Tem de estar protegido tal como o HTML.
curl -sS -o /dev/null -w '%{http_code}\n' "$DOMINIO/magick/magick.wasm"

# A página de diagnóstico.
curl -sS -o /dev/null -w '%{http_code}\n' "$DOMINIO/diagnostico.html"
```

E no browser, numa janela privada:

1. Abrir o domínio: deve aparecer o ecrã do Access a pedir o email.
2. Pedir código com um email **fora** de `@caetano.pt`: deve ser recusado.
3. Pedir código com um email da equipa: deve entrar e a aplicação funcionar
   normalmente.
4. Se o site estiver alojado fora da Cloudflare, repetir o primeiro `curl`
   contra o domínio da origem, por exemplo `projeto.vercel.app`. Se devolver
   `200`, o furo da secção anterior está aberto.

---

## O que não muda

- **A aplicação não sabe que isto existe.** Nenhuma rota nova, nenhuma variável
  de ambiente, nenhuma dependência, nenhuma alteração ao código.
- **A conversão continua no dispositivo.** O Access decide se os ficheiros da
  aplicação são entregues. Não toca nas imagens, que nunca saem do browser.
  Tudo o que está em `docs/privacidade.md` continua verdadeiro.
- **A suite end to end não é afetada.** Serve o `out/` localmente com
  `python3 -m http.server`, sem passar pela Cloudflare.
- **Não há base de dados**, e continua a não haver.

## O que muda em matéria de dados pessoais

Passa a existir registo de **quem acedeu e quando**, nos logs do Cloudflare,
com o email e o endereço IP. Antes disto não existia registo nenhum de
utilização.

Não são dados das imagens, e o conteúdo processado continua a não sair do
dispositivo. Mas é tratamento de dados pessoais que antes não havia, e deve
constar na documentação interna de privacidade da empresa, com um prazo de
retenção definido nas configurações de log do Cloudflare.
