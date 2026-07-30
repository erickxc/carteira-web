# Design: ajuste visual dos cards da página Ações + sinal de contato recente

Data: 2026-07-30

## Contexto

Crítica de design (via skill `ui-ux-designer`) sobre a aba "Acompanhamento" da página `/acoes`: os cards de cliente (`CardCliente.tsx`) não têm hierarquia visual entre as 3 seções de severidade (Vencidos/Vencendo/Em dia) — só o texto do relógio muda de cor, a "casca" do card é idêntica. Além disso, quando um monitor registra um "Contato" (ação leve) com um cliente vencido, esse fato fica enterrado na lista pequena "ÚLTIMAS AÇÕES", enquanto o alarme vermelho do topo do card continua dominando — dando a sensação de que a ação registrada "não teve efeito".

Direção escolhida: **ajuste cirúrgico** (não uma reestruturação do card) — resolve os dois problemas com mudanças pequenas e localizadas, mantendo a estrutura atual.

## 1. Borda de severidade no card

Cards de cliente na fila (`cardDeFila` em `AcoesPage.tsx`, os que recebem `relogios`) ganham uma borda esquerda colorida por severidade — mesma técnica já usada em `CardEvento.tsx` (`borderLeftColor` + `borderLeftWidth`).

- `classificarCadencia(f)` (já existe em `cadenciaServico.ts`, usado hoje só pra agrupar) passa a ser repassado também como prop `severidade` pro `CardCliente`.
- Mapeamento de cor: `vencido` → `var(--danger)`, `vencendo` → `var(--warning)`, `em_dia` → sem cor especial (borda padrão do card, como hoje).
- Cards sem `relogios` (grupo "Atendidos pelo Marco") não recebem essa borda — não participam do modelo de cadência.

## 2. Linha "contato recente" — resolve o problema central

Dentro do bloco de relógios do `CardCliente` (branch `relogios && relogios.length > 0`), adicionar uma linha nova **abaixo** dos relógios, mostrada **só quando** o contato mais recente do cliente (`ultimoContato`, que já inclui Ações tipo "Contato" registradas — `buildUltimaInteracaoMap`) for mais recente que o último toque contado por QUALQUER relógio de serviço (`Math.max(...relogios.map(r => r.ultimo))`).

Ou seja: só aparece quando existe uma interação real (o contato) que os relógios de Monitoria/Price não estão refletindo — exatamente o caso relatado.

- Texto: `✓ Contato feito {rotuloData(ultimoContato)}` (reaproveita `rotuloData` de `acoesHelpers.ts` — já formata "hoje"/"ontem"/"há N dias").
- Estilo: tom neutro/secundário (`var(--text-secondary)`), **não** vermelho nem verde-sucesso-gritante — deliberadamente calmo, pra não competir com o alarme de severidade acima nem parecer que "resolveu" a pendência (a cadência de serviço continua vencida de fato; isso é só transparência de que alguém já agiu).
- Não altera `classificarCadencia`, `buildFilaCadencia`, nem a seção em que o card aparece — comportamento 100% visual, conforme decidido.

## 3. Contraste dos badges de serviço (Monitoria/Price)

Troca `variant="muted"` → `variant="accent"` nos badges de produto dentro de `CardCliente` — mesmo variant já usado em outros lugares do app pra badges de serviço (ex.: `ClienteDetailPage`), só padronizando.

## Fora de escopo (confirmado com o usuário)

- Tabela da aba "Ações" (histórico) — fica para uma rodada futura, não entra nesta mudança.
- Reestruturação do card (Direção B) — não escolhida.
- Qualquer mudança na lógica de `buildFilaCadencia`/classificação — a fila e as seções continuam calculadas exatamente como hoje.

## Testes (manual)

1. Cliente "vencido" com um Contato registrado hoje → card mostra borda vermelha + linha "✓ Contato feito hoje" abaixo do relógio, card continua na seção Vencidos.
2. Cliente "vencido" sem nenhum contato recente → sem a linha nova (comportamento atual preservado).
3. Cliente "em dia" → sem borda especial, sem a linha (a menos que haja um contato mais recente que o próprio touch de Monitoria/Price, caso em que a linha pode aparecer mesmo em dia — comportamento aceitável, é só informativo).
4. Grupo "Atendidos pelo Marco" → sem mudança nenhuma (sem `relogios`).
5. Badges Monitoria/Price → visualmente mais destacados (dourado/accent) em vez de cinza apagado.
