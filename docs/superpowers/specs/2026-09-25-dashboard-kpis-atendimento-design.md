# Visão Geral: KPIs explicáveis, prazo por atendimento e serviço obrigatório

Data: 2026-09-25 · Status: aprovado em conversa, aguardando revisão desta spec

## Objetivo

A Visão Geral é o painel de KPIs do **monitor no dia a dia**. Os KPIs de hoje continuam
os mesmos; o que muda é que cada número (1) diz o que conta, (2) tem referência e (3)
ocupa um lugar claro na hierarquia. Junto, corrigir as regras de cálculo que faziam
os cards discordarem entre si, e tornar o serviço obrigatório nos eventos, porque sem
ele não dá pra saber qual prazo um evento cumpre.

Fora de escopo: trocar ou remover KPIs; visão de gestão (Marco); campo de "finalidade"
do contato (marcar reunião, tirar dúvida); meta configurável por KPI.

## 1. Regras de cálculo

Fonte única: `shared/cadenciaServico.cjs` (motor usado pela tela, pela fila de Ações e
pelo monitorIA). As cópias paralelas também passam a seguir estas regras:
`server/dominio/cadenciaServico.cjs` (`buscarCobertura`, `calcularAderencia`,
`buscarCoberturaServicos`) e `src/utils/cadenciaServico.ts` (`buildVencendoDashboard`).

### 1.1 Unidade

- **Atendimento** = uma loja/cadastro ativo (`isClienteAtivo`). Hoje: 38.
- **Cliente** = rede (`grupo`, senão o próprio cadastro). Hoje: 30. Usado só no KPI
  "Clientes ativos".
- Os cards de prazo (bloco 2) contam **atendimentos** e dizem isso no rótulo.

### 1.2 Relógio por serviço

- Cada atendimento tem um relógio por serviço contratado com prazo: **Monitoria (30 dias)**
  e **Price (15 dias)**. Serviço marcado como independente não tem relógio. Protocolo
  GPS, OptiMarco e Controladoria não têm prazo.
- **Toque** (zera o relógio) exige, ao mesmo tempo:
  - status **concluído ou realizado** (`/conclu|realiz/i`). Evento no passado ainda
    "Agendado"/"Pendente" **não** conta (hoje conta, só exclui cancelado/reagendado);
  - tipo de entrega: **Reunião, Relatório ou Precificação**. Contato e Ligação nunca
    zeram prazo, mesmo com serviço marcado;
  - o **serviço do relógio marcado no evento**. Reunião sem serviço deixa de contar
    como Monitoria. Relatório com Monitoria passa a zerar a Monitoria (hoje nenhum
    relatório da Agenda conta). Precificação conta como Price pelo próprio tipo.
  - Ações concluídas continuam valendo: Ação "relatório" zera Monitoria, Ação "price"
    zera Price.
- **Reagendamento**: a mesma reunião recebe a data nova (`datasAnteriores` guarda as
  antigas, `reagendamentos` conta). O toque vale na data nova, quando concluída. Nada
  a mudar no fluxo; a regra de "só concluído" já garante isso.
- **Estados**: em dia · vencendo (faltam 5 dias ou menos, ainda no prazo) · vencido ·
  nunca atendido.
- **Carência de atendimento novo**: sem nenhum toque, o relógio é calculado como se
  `createdAt` fosse o último toque. Ele passa por em dia e vencendo e só vira "nunca
  atendido" (fora do prazo) quando esse primeiro prazo vence. Hoje "nunca" é
  imediato, desde o dia do cadastro.
- **Reunião futura marcada** não tira do atraso; aparece como informação ("próxima: 29/09").

### 1.3 Cards

| Card | Regra | Base |
|---|---|---|
| Atendimentos no Ritmo | em dia = **todos** os relógios em dia ou vencendo | atendimentos com pelo menos 1 relógio (hoje 37; a MEGA fica fora e o card diz por quê) |
| Cobertura dos Atendimentos | pelo menos 1 entrega **concluída** (reunião, relatório ou precificação) no mês atual ou no anterior | atendimentos que não têm todos os serviços independentes (hoje 38) |
| Cobertura por Serviço | relógio daquele serviço em dia ou vencendo | **só quem tem o relógio do serviço** (hoje conta independentes como descobertos para sempre) |

A regra de "em dia" do Ritmo passa a ser estrita também no filtro "Geral" (hoje basta um
serviço em dia). Os filtros Monitoria/Price seguem olhando só o relógio do serviço, mas
"vencendo" passa a contar como no prazo, igual ao Geral.

### 1.4 Definições comuns aos demais cards

- **Entrega** = Reunião, Relatório ou Precificação **concluída ou realizada**, em todo
  card. Hoje Top 10, Atendimento e Recuperados deixam precificação de fora, e o card
  Atendimento aceita "passou da data e não foi cancelada".
- **Falamos com o cliente** (última interação, `buildUltimaInteracaoMap`) = evento de
  **qualquer tipo concluído** ou Ação concluída. Cancelado e "Agendado" deixam de
  contar. Muda a regra antiga de que cancelar contava como contato; a função é
  compartilhada, então vale também para a fila de Ações (contato recente) e para o
  alerta "sem contato há 30+ dias" do monitorIA.

### 1.5 Blocos 3 e 4, card a card

| Card | Regra nova | Hoje (25/09) → depois |
|---|---|---|
| Vencendo | relógios de Monitoria e Price do motor (seção 1.2) a 5 dias ou menos do prazo. **Sai o relógio de "Relatório"** e o filtro "Relatório": relatório zera Monitoria, não tem prazo próprio | 2 itens (Pecita - TOP1000, Tadeu) |
| Atendimentos sem acompanhamento | 30+ dias desde que falamos com o cliente (1.4). **Ignora o filtro Tipo do topo**. Mostra o total e "ver todos" (hoje corta em 6 sem avisar) | 3 → 8 (entram GAP, Motobrás, Aliança - Itaboraí, Multimarcas, Mosca Branca) |
| Próximas agendas | todos os tipos, exceto relatórios, nas 5 próximas; **relatórios dos próximos 7 dias viram uma linha resumo** ("3 relatórios esta semana: MEGA, Golfinho, Quality"). Um só filtro de tipo (o do card) | hoje 1 das 5 é relatório automático da MEGA |
| Top 10 atendimentos | entregas (1.4) no ano | Vitorinos 8→9, Viannax 6→7 |
| Atendimento (renomear: "Desfecho e esforço das reuniões") | **segue o mês do filtro do topo**; somem os botões de período e o filtro de monitor próprio (usa o global). "Realizadas" = concluídas. "Ações por entrega" usa a entrega de 1.4 | agosto: sem mudança de número hoje |
| Recuperados | entregas (1.4); mantém a janela de trimestre, escrita no cabeçalho | 17, sem mudança hoje |
| Alertas programados | lembretes ativos **do monitor do filtro global** (via cliente do lembrete); tipos que só diferem por maiúscula contam como um ("alvo" e "Alvo") | 23 ativos, 1 de atendimento inativo sai |
| Reuniões concluídas por mês | sem mudança | — |

### 1.6 Prazo de Price = 15 dias em todo lugar

Hoje o valor salvo é 15, mas o código cai para 30 quando a configuração falta e o
glossário do agente diz 30. Trocar para 15:

- `server/config.cjs` (seed `price_dias`)
- `shared/cadenciaServico.cjs`, `server/dominio/cadenciaServico.cjs`,
  `src/utils/cadenciaServico.ts` (fallback `|| 30`)
- `src/context/CarteiraContext.tsx` (`CADENCIAS_PADRAO`)
- `server/ia/conceitosCarteira.cjs` (glossário: "Monitoria 30 dias, Price 15 dias")
- `src/pages/ConfiguracoesPage.tsx` (texto de ajuda: zera com reunião, relatório ou
  precificação de Price, só quando concluídos)
- testes que fixam `price_dias: 30` passam a refletir o padrão novo onde testam o padrão

## 2. Serviço obrigatório e legado

### 2.1 Validação

- Todo evento (Reunião, Relatório, Precificação, Contato, Ligação) exige pelo menos um
  serviço. Validar no backend (`server/validation.cjs`, criar e atualizar) e no
  formulário (`EventFormModal`), com mensagem clara.
- Precificação já nasce com Price preenchido.
- Caminhos que criam evento sem formulário também precisam preencher: relatórios
  automáticos (`relatorioCadencia`, preenche Monitoria), ferramentas do monitorIA
  (`criar_evento`, validado contra o cadastro), importação de resumo. O plano de
  implementação lista cada um.

### 2.2 Legado (270 eventos sem serviço hoje)

Script único, idempotente, com backup do SQLite antes de gravar:

- **Automático só quando é certo**:
  - Precificação → Price (6).
  - Relatório → Monitoria (104), mesma regra da Ação "relatório".
  - Reunião, Contato, Ligação de atendimento que contrata **só um** entre Monitoria e
    Price → esse serviço (20 reuniões, 31 contatos, 2 ligações).
- **Revisão manual**: os ambíguos (cliente com Monitoria e Price: 42 reuniões,
  61 contatos, 2 ligações) e os 2 de cliente removido. A Agenda ganha um filtro
  "sem serviço" para achar e corrigir esses eventos.
- Impacto medido: parar de contar reunião sem serviço não muda o Ritmo de hoje (todas
  são de março a agosto). Exigir toque concluído muda o Ritmo de 15 para 13 (Mosca
  Branca e Pecita - Seropédica, ambas ainda "Agendado").

## 3. Apresentação (mockup v4)

Mesmos KPIs, em 4 blocos, nesta ordem:

1. **Carteira e mês em números** — Clientes ativos, Total de atendimentos, Reuniões
   concluídas, Reuniões agendadas, Reuniões reagendadas.
2. **Os atendimentos estão no prazo?** — Atendimentos no Ritmo, Cobertura dos
   Atendimentos, Cobertura por Serviço.
3. **O que fazer agora** — Vencendo, Atendimentos sem acompanhamento, Próximas agendas.
4. **Análise** — Top 10, Atendimento, Recuperados, Alertas programados, Reuniões
   concluídas por mês.

Formato de cada KPI (contrato de stat tile):

- rótulo em frase; valor; **"X de Y"** quando é proporção;
- **referência** com nome do período: carteira hoje vs **mesma data do mês anterior**;
  contagens do mês vs **mês anterior até o mesmo dia**. Seta e cor pela direção ×
  "subir é bom?" (reagendamento subindo é vermelho);
- **uma linha de "como conta"** sempre visível;
- **janela no cabeçalho** do card quando ela não for o mês do filtro ("próx. 5 dias",
  "ago + set", "30+ dias").

Visual:

- Um número por vez com mais peso: os tiles do bloco 1 com valor grande em algarismos
  proporcionais (não `tabular-nums`, que fica só em tabelas e listas).
- Donuts de proporção viram **barra de progresso** (meter) com "X de Y".
- Cor só semântica (sucesso/atenção/perigo), sempre com texto ou ícone junto; sai o
  azul solto de "Aguardando retorno". Sem fundo pastel colorido.
- "Agendadas" não tem comparação: o sistema não guarda o que estava agendado no passado.
  O card diz isso em vez de inventar um número.

Comparações com o passado usam o motor com `now` no mês anterior. Para status do
cliente, `StatusHistorico` (1.4.47); antes disso é aproximação, e o tile não pode
afirmar precisão que não tem.

Janelas próprias: o card Atendimento passa a seguir o mês do filtro do topo (1.5);
Recuperados mantém o trimestre, escrito no cabeçalho.

## 3b. Dashboard da Carteira (`/clientes/dashboard`)

Mesmo contrato de KPI da seção 3 ("X de Y", referência ao mês anterior, linha de "como
conta"). Unidade: **atendimento** em todos os cards, com rótulo certo; só o KPI "Total
de clientes" conta rede.

| Indicador | Regra nova | Hoje (25/09) |
|---|---|---|
| Total de clientes | redes ativas (sem mudança) | 30 |
| Atendimentos ativos | sem mudança | 38 |
| Atendimentos inativos → **Fora da monitoria** | mesmo número, com a quebra por motivo: Atendido pelo Marco, Suspenso, Problemas Externos, pausados, `estado` Inativo | 17 = Marco 5 + Suspenso 5 + Problemas Externos 7 |
| Novos clientes no mês → **Novos atendimentos no mês** | cadastros criados no mês | 1 (Mosca Branca) |
| Serviços por cliente ativo → **Serviços por atendimento** | média só de Monitoria e Price (os com prazo); os outros serviços aparecem na linha de "como conta" | 2,2 → 1,6 |
| Crescimento da Carteira | **atendimentos ativos no fim de cada mês**, a partir do `StatusHistorico` (`clientesEm`); meses antes do início do log ficam marcados como aproximação | hoje: acumulado de cadastros, nunca cai (55, com 17 inativos) |
| Profundidade de Serviços | por atendimento, rótulo corrigido | 1: 7 · 2: 17 · 3+: 14 |
| Distribuição de Risco | por atendimento; comparação com a mesma data do mês anterior via `AnalisesIAHistorico` | alto 14 · médio 19 · baixo 4 · sem análise 1 |
| Saúde da Carteira | passa a respeitar o filtro de monitor (hoje é o único que ignora) | 55 cadastros por status |
| Concentração por Monitor | some quando há monitor selecionado no filtro global | Yann 20 · Erick 18 |
| Segmento / Linha | "Não informado" sai das barras e vira pendência ("15 atendimentos sem segmento") | segmento: 15 de 38 vazios; linha: 2 |
| Abrangência (mapa) | nota fixa "estado estimado pelo DDD do telefone" | 33 de 38 com DDD próprio; Mosca Branca sem telefone |

## 4. monitorIA

- `buscar_cobertura`, `buscar_cobertura_servicos`, fila e aderência do agente usam o
  mesmo motor/regras (seção 1). Descrições das ferramentas atualizadas.
- Glossário (`conceitosCarteira.cjs`): Price 15 dias, "atendimento" vs "cliente",
  só toque concluído.
- Checklist do CLAUDE.md: o filtro "sem serviço" é de interface e a revisão é manual;
  não entra ferramenta nova para o agente.

## 5. Testes

- Motor: toque só concluído; reunião sem serviço não conta; relatório com Monitoria
  conta; contato com serviço não conta; carência de atendimento novo; reagendado
  concluído conta na data nova; Price padrão 15.
- Cards: Cobertura por Serviço exclui independentes e conta vencendo como no prazo;
  Ritmo estrito no Geral; Vencendo sem relógio de Relatório; sem acompanhamento
  ignora cancelado/"Agendado" e o filtro Tipo; entrega inclui precificação em Top 10,
  Atendimento e Recuperados; Próximas agrupa relatórios; Alertas programados filtra
  por monitor e une tipos por maiúscula.
- Validação: evento sem serviço é rejeitado (backend e formulário).
- Script de legado: dedução certa, ambíguo intocado, idempotente, backup gerado.
- Paridade tela × monitorIA para Cobertura e Ritmo com o mesmo dado.

## Ordem de entrega

Cada fase é uma release própria, testável sozinha:

1. **Regras de cálculo**: motor (1.2 a 1.4), Price 15 dias, cópias do backend e
   glossário do monitorIA. Muda números, não muda layout.
2. **Serviço obrigatório e legado**: validação, script de preenchimento com backup,
   filtro "sem serviço" na Agenda.
3. **Visão Geral**: blocos, contrato de KPI, comparações, cards dos blocos 3 e 4 (1.5).
4. **Dashboard da Carteira** (3b).

## Riscos

- "Falamos com o cliente" deixa de contar cancelado e "Agendado": a lista de sem
  acompanhamento sobe de 3 para 8 e a ordem da fila de Ações muda para quem só tinha
  esse tipo de contato. É o efeito pedido, mas vai aparecer para o time no dia seguinte
  à release.
- A fila de Ações usa o mesmo motor: exigir toque concluído e ignorar reunião sem
  serviço reordena a fila. Medido hoje: 2 atendimentos mudam (Mosca Branca, Pecita -
  Seropédica).
- Serviço obrigatório em Contato adiciona um campo no registro rápido; o formulário
  deve sugerir o serviço quando o atendimento só tem um.
- Escrita em massa no legado: backup antes e script idempotente. Nunca rodar com
  `SQLITE_DIR` de produção durante teste.
