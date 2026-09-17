# Design: toggle "Mostrar agendas recomendadas" na Agenda

Data: 2026-09-17

Substitui a lista recolhível "Sugestões de encaixe" (`SugestaoAgendaCard`) por um toggle que sobrepõe as mesmas sugestões como eventos translúcidos diretamente no calendário, nas duas visões (Mês e Semana).

## Contexto

Já existe `src/utils/sugestaoAgenda.ts::sugerirAgenda`, usada hoje só por `SugestaoAgendaCard.tsx` (card recolhível acima do calendário em `AgendaPage.tsx`, com botão "Agendar" por linha). A função já:

- Usa a mesma fila de prioridade de Ações (`buildFilaCadencia`).
- Filtra só quem precisa de ação e não tem reunião futura marcada.
- Só sugere em dia útil (`isBusinessDay`).
- Evita horário já ocupado pelo mesmo monitor (mesma regra de conflito do `EventFormModal`).
- Respeita um teto de reuniões por dia por monitor (`MAX_POR_DIA_POR_MONITOR`, hoje 2 — não muda).

Hoje ela roda numa janela fixa de 10 dias úteis a partir de amanhã, com teto de 8 sugestões no total.

## 1. `sugerirAgenda` — janela dinâmica, sem teto

- Nova função auxiliar `diasUteisAteFimDoMes(agora)`: dias úteis de amanhã até o último dia do mês corrente de `agora` (usa `isBusinessDay`, mesmo helper já usado).
- `sugerirAgenda` deixa de receber `dias`/`max` como conceito de janela fixa — a janela agora é sempre "amanhã até o fim do mês corrente". O parâmetro `agora` continua existindo (testes determinísticos).
- Remove o corte antecipado do laço principal (`if (out.length >= maxSugestoes) break`) — itera a fila inteira; só para de sugerir um cliente quando não sobra slot livre na janela (mesma lógica de dia/hora/monitor de hoje).
- Se o mês não tem mais dia útil sobrando (ex.: hoje é o último dia útil), a janela fica vazia e a função devolve `[]` — sem tratamento especial, mesmo comportamento de "sem sugestão".

## 2. Toggle e escopo por mês

- Novo controle "Mostrar agendas recomendadas" (ícone `Bot` do `lucide-react`, o mesmo já usado pro item "monitorIA" da sidebar), ao lado das abas Mês/Semana em `AgendaPage.tsx`.
- Estado via `usePersistedState('filtro:agenda:mostrarRecomendadas', false)` — mesmo padrão do `view` (Mês/Semana) já existente. Começa desligado, lembra a escolha entre sessões.
- Sugestões só existem (são calculadas e exibidas) quando o período visível é o **mês corrente de verdade** (`isSameMonth(new Date(), currentMonth)` na visão Mês; `isSameMonth(new Date(), weekRef)` na visão Semana). Navegar pra outro mês/semana fora do mês atual não mostra nenhuma sugestão, mesmo com o toggle ligado — sem mensagem de aviso especial, só fica vazio (mesmo padrão de "sem sugestão" acima).
- O cálculo (`sugerirAgenda`) só roda quando o toggle está ligado E o período é o mês corrente — evita trabalho à toa quando desligado.

## 3. Renderização

**MonthGrid** (`src/components/agenda/MonthGrid.tsx`):
- Nova prop `sugestoesByDay: Map<string, SugestaoSlot[]>` (mesma chave `yyyy-MM-dd` dos outros mapas por dia), passada de `AgendaPage.tsx`.
- Cada sugestão vira um chip novo, classe `calendar-chip is-sugestao` — visual translúcido/tracejado com o `--accent`, para não ser confundido com o chip cinza `is-ghost` que já existe (esse é rastro de reunião remarcada, conceito diferente, não mexe). Ícone `Bot` pequeno no chip.
- Renderizado depois dos eventos reais do dia (mesma posição onde `is-ghost` já aparece hoje).
- Clicável (diferente do `is-ghost`, que não é): `onClick` chama `onSelecionarSugestao(sugestao)`.

**WeekKanban** (`src/components/agenda/WeekKanban.tsx`):
- Nova prop `sugestoesByDay: Map<string, SugestaoSlot[]>`.
- Cada sugestão entra no bloco do turno certo (manhã/tarde, decidido pelo `hora` da sugestão, mesmo corte que já existe pros eventos reais), como um chip próprio — **fora** do agrupamento por sala (`agruparPorSala`), já que sugestão não tem sala.
- Mesmo visual/classe `calendar-chip is-sugestao` do MonthGrid, clicável do mesmo jeito.

## 4. Interação

- Clicar num chip de sugestão chama a mesma função que o botão "Agendar" da lista antiga usava: `setModalState({ initialClientId: sugestao.cliente.id, defaultDate: sugestao.dia, initialTime: sugestao.hora })` — abre o `EventFormModal` já existente, pré-preenchido. Usuário confirma ou ajusta normalmente; nada é gravado só de clicar.

## 5. Remoção

- `src/components/agenda/SugestaoAgendaCard.tsx` é deletado.
- Uso em `AgendaPage.tsx` (import + `<SugestaoAgendaCard onAgendar={...} />`) é removido, substituído pela prop nova passada pro `MonthGrid`/`WeekKanban` e pelo toggle.

## 6. Testes

- `src/utils/sugestaoAgenda.test.ts`: atualizar pra nova janela dinâmica (dias úteis até fim do mês, a partir de `agora` controlado no teste) e ausência de teto (cenário com mais de 8 clientes precisando de ação e dias suficientes deve sugerir todos, não parar em 8).
- Sem teste de componente novo previsto — segue o padrão atual do projeto pra `MonthGrid`/`WeekKanban` (sem testes de componente hoje).

## Fora de escopo

- Não muda `buildFilaCadencia`, `classificarCadencia`, nem a fila de Ações.
- Não muda o teto diário por monitor (`MAX_POR_DIA_POR_MONITOR`) nem a lista de horários candidatos (`HORARIOS`).
- Não mexe no chip `is-ghost` existente (rastro de reunião remarcada) — é um conceito visual e de dados diferente, mantido como está.
- Não adiciona confirmação/menu intermediário ao clicar na sugestão — vai direto pro modal pré-preenchido.
