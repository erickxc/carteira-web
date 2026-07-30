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

## 2. Borda no bloco do relógio — resolve o problema central

Dentro do `CardCliente` (branch `relogios && relogios.length > 0`), o bloco que contém as linhas de relógio (`Monitoria: nunca atendido` etc. — hoje `<div className="acao-card-info is-stack">`) ganha uma **borda ao redor (4 lados) na cor accent/dourada** quando o contato mais recente do cliente (`ultimoContato`, que já inclui Ações tipo "Contato" registradas — `buildUltimaInteracaoMap`) for mais recente que o último toque contado por QUALQUER relógio de serviço (`Math.max(...relogios.map(r => r.ultimo))`).

Ou seja: a borda só aparece quando existe uma interação real (o contato) que os relógios de Monitoria/Price não estão refletindo — exatamente o caso relatado. Sem texto novo, sem ícone — só a borda.

- Cor: `var(--accent)` (dourado da marca) — neutra o suficiente pra não parecer "bom" (verde) nem "ruim" (vermelho), só sinaliza "houve ação recente aqui".
- Essa borda é independente da borda esquerda de severidade do item 1 (posições diferentes — uma é do card inteiro, outra é só do bloco interno do relógio — não conflitam).
- Não altera `classificarCadencia`, `buildFilaCadencia`, nem a seção em que o card aparece — comportamento 100% visual, conforme decidido.

## 3. Contraste dos badges de serviço (Monitoria/Price)

Troca `variant="muted"` → `variant="accent"` nos badges de produto dentro de `CardCliente` — mesmo variant já usado em outros lugares do app pra badges de serviço (ex.: `ClienteDetailPage`), só padronizando.

## 4. Reordenação da fila (extensão pedida depois da 1ª aprovação)

Cliente com contato recente não refletido (mesma condição do item 2) passa a ir pro **fim da própria seção de severidade** dentro da fila — continua Vencido/Vencendo/Em dia, só perde prioridade dentro do próprio grupo pra quem realmente não teve nenhum contato ainda. Vale em qualquer lugar que usa `buildFilaCadencia` (AcoesPage, Dashboard, AcaoFormModal), não só na view "Precisam de ação".

- `buildFilaCadencia` ganha um novo parâmetro `acoes: Acao[]` (pra calcular a última interação via `buildUltimaInteracaoMap`, que já considera Ações tipo Contato). Os 3 call-sites (`AcoesPage.tsx`, `useDashboardData.ts`, `AcaoFormModal.tsx`) passam a fornecer `acoes`.
- Novo helper exportado `contatoRecenteNaoRefletido(relogios, ultimoContato)` em `cadenciaServico.ts` — usado tanto pra ordenar a fila quanto pelo `CardCliente` pra decidir a borda dourada do item 2 (fonte única, sem duplicar a regra).
- Ordenação final: 1º por severidade (vencido < vencendo < em_dia), 2º por "tem contato recente não refletido" (quem não tem vem primeiro), 3º pelo `score` de urgência (como já era).

## Fora de escopo (confirmado com o usuário)

- Tabela da aba "Ações" (histórico) — fica para uma rodada futura, não entra nesta mudança.
- Reestruturação do card (Direção B) — não escolhida.
- Mudança na classificação em si (`classificarCadencia`) — Vencido/Vencendo/Em dia continuam calculados exatamente como hoje; só a ORDEM dentro de cada grupo mudou.

## Testes (manual)

1. Cliente "vencido" com um Contato registrado hoje → card mostra borda esquerda vermelha (severidade) + borda dourada ao redor do bloco do relógio (contato recente), card continua na seção Vencidos.
2. Cliente "vencido" sem nenhum contato recente → sem a borda dourada (comportamento atual preservado).
3. Cliente "em dia" → sem borda de severidade especial, sem a borda dourada (a menos que haja um contato mais recente que o próprio touch de Monitoria/Price, caso em que a borda dourada pode aparecer mesmo em dia — comportamento aceitável, é só informativo).
4. Grupo "Atendidos pelo Marco" → sem mudança nenhuma (sem `relogios`).
5. Badges Monitoria/Price → visualmente mais destacados (dourado/accent) em vez de cinza apagado.
