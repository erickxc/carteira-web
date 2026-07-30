# Design: edição de evento agendado, cadência de relatório por cliente, sidebar

Data: 2026-07-30

Três mudanças independentes, pedidas na mesma conversa. Cada uma pode ser implementada e revisada separadamente.

## 1. Editar evento agendado no Histórico do cliente

**Problema:** em `ClienteDetailPage` (`/clientes/:id`), a seção "Histórico" lista todos os eventos de agenda do cliente como texto estático — sem clique, sem edição. A única forma de editar um evento é achá-lo na página `/agenda`.

**Mudança:** itens do Histórico cujo status ainda não é final (ver regra abaixo) passam a ser clicáveis. Clicar abre `EventFormModal` com `initial={evento}` — o componente já suporta edição completa (é o mesmo modal usado em `/agenda`), então não há lógica de formulário nova aqui.

**Regra "ainda não aconteceu" (editável):** baseada em **status**, não em data — mesma regex já usada em `src/components/agenda/CardEvento.tsx`:
- Não editável (só leitura, como hoje): status casa com `/conclu|realiz/i` (concluído) OU `/cancel|reagend/i` (cancelado/reagendado).
- Editável: qualquer outro status (ex.: "Agendado").

**Arquivos afetados:**
- `src/pages/ClienteDetailPage.tsx`: novo state `eventoEditando: EventoAgenda | null`; envolver o item de histórico elegível num elemento clicável (`onClick={() => setEventoEditando(evento)}`); renderizar `{eventoEditando && <EventFormModal initial={eventoEditando} onClose={() => setEventoEditando(null)} />}`.

**Fora de escopo:** não muda nada no `EventFormModal` em si, nem na página `/agenda`.

---

## 2. Cadência de Relatório por Cliente + renovação automática

**Problema:** hoje não existe um jeito de dizer "esse cliente recebe um Relatório a cada X" e ter isso refletido sozinho na agenda. A única recorrência que existe é a do `EventFormModal` (bloco "Recorrência"), que gera um lote fixo de eventos de uma vez (ex.: 12 de uma vez para o ano) — o que o usuário explicitamente não quer para relatórios ("não criar relatórios infinitos na agenda").

**O que muda:** a cadência de relatório passa a ser uma configuração **do cliente** (não do evento), e um mecanismo automático mantém a agenda com **sempre 1** relatório futuro pendente por cliente, renovando toda sexta-feira.

### 2.1 Configuração — novo campo no Cliente

Novo tipo em `src/types/index.ts`:

```ts
export type UnidadeCadenciaRelatorio = 'dia' | 'semana' | 'mes' | 'trimestre' | 'semestre' | 'personalizado';

export interface RelatorioCadencia {
  numero: number;
  unidade: UnidadeCadenciaRelatorio;
  /** Só usado quando unidade = 'personalizado'. 0=domingo..6=sábado. */
  diasSemana?: number[];
}
```

Adicionar `relatorioCadencia?: RelatorioCadencia` em `Cliente` (`src/types/index.ts`). Campo opcional — cliente sem essa config simplesmente não participa da geração automática.

**Serialização:** é objeto aninhado, e o SheetJS (`json_to_sheet`) não sobrevive a isso — mesmo problema documentado no CLAUDE.md para `notas`/`attachments`. Seguir o mesmo padrão em `src/api/client.ts`: serializar para JSON string antes de enviar (`serializeCliente`/equivalente), desserializar na leitura (`deserializeCliente`).

**Backend:** `server/config.cjs` (headers da sheet `Clientes`) e `server/db.cjs` precisam incluir a nova coluna `relatorioCadencia` (string JSON, igual às demais colunas serializadas).

### 2.2 UI — `ClientFormModal`

Nova seção "Relatório automático" em `src/components/ClientFormModal.tsx`, depois do campo "Observação":
- Toggle/checkbox "Gerar relatórios automaticamente" (liga/desliga — quando desligado, `relatorioCadencia` vira `undefined`).
- Quando ligado: `Input type="number"` (número) + `Select` (unidade: Dia, Semana, Mês, Trimestre, Semestre, Personalizado).
- Quando unidade = Personalizado: mostra seletor de dias da semana (reaproveitar a constante `DIAS_SEMANA` já definida em `src/components/eventForm/RecorrenciaFields.tsx` — extrair para um local compartilhado, ex. `src/utils/diasSemana.ts`, para não duplicar). O campo "número" continua visível e significa "a cada N semanas, nesses dias" (número=1 → toda semana).

### 2.3 Cálculo da próxima data — função pura compartilhada por design, mas duplicada por restrição técnica

Função `calcularProximaDataRelatorio(cadencia: RelatorioCadencia, referencia: Date): Date`:
- `dia`: `addDays(referencia, numero)`.
- `semana`: `addWeeks(referencia, numero)`.
- `mes`: `addMonths(referencia, numero)`.
- `trimestre`: `addMonths(referencia, numero * 3)`.
- `semestre`: `addMonths(referencia, numero * 6)`.
- `personalizado`: próxima ocorrência de qualquer um dos `diasSemana` a partir de `referencia`, pulando `numero - 1` semanas extras (número=2 → pula uma ocorrência, cai na seguinte). Mesma lógica de "próximo dia da semana ≥ base" já usada em `useRecorrencia.ts` (`gerarDatas`, modo `semana`), generalizada para múltiplos dias.

Essa função existe em dois lugares:
- `src/utils/cadenciaRelatorio.ts` (TS/ESM) — usada pelo frontend (ex.: preview futuro, se necessário).
- `server/cadenciaRelatorio.cjs` (CommonJS) — usada pelo cron do backend.

**Por quê duplicada:** o backend roda direto com `node server.cjs` sem build step (CommonJS), o frontend é TS/ESM buildado pelo Vite — não há hoje nenhuma infra de pacote compartilhado entre os dois lados. Duplicar essa função pura e pequena é mais simples e mais alinhado à arquitetura atual do que introduzir um build step ou pacote compartilhado só para isso. Comentário no topo dos dois arquivos apontando um para o outro, para quem for alterar a regra não esquecer do outro lado.

### 2.4 Motor de geração — backend

Nova função em `server/cadenciaRelatorio.cjs` (ou arquivo novo `server/relatorios.cjs`): `gerarRelatoriosPendentes()`:

1. Lê `Clientes` e `Agenda` via `getSheetData`.
2. Filtra clientes ativos (mesmo critério de `isStatusAtivo` + não `atendidoMarco`, espelhando `buildFilaCadencia`) com `relatorioCadencia` configurado.
3. Para cada um, verifica se já existe um evento `type === 'Relatório'` **futuro** (data > agora) com status não-cancelado/reagendado para aquele `clientId`. Se existir → pula (regra "só o próximo").
4. Se não existir: data de referência = data do relatório mais recente **passado** daquele cliente (qualquer status, exceto cancelado), ou "agora" se nunca houve um. Calcula a próxima data com `calcularProximaDataRelatorio`.
5. Cria o evento: `{ id: crypto.randomUUID(), clientId, clientName, date: proximaData.toISOString(), type: 'Relatório', subject: '', description: '', servicos: [], attachments: [], status: 'Agendado', monitor: cliente.monitor || undefined, checklist: [] }` e grava via `saveSheetData('Agenda', ...)`.
6. Qualquer erro em um cliente individual é capturado e logado (`console.warn`) — não interrompe o processamento dos demais nem derruba o processo (mesmo espírito da nota já existente no CLAUDE.md sobre concorrência de escrita com o OneDrive).

**Exceção documentada:** IDs de evento são hoje sempre gerados no frontend e enviados na requisição (regra explícita no CLAUDE.md). Aqui não há requisição de frontend — é o único ponto do sistema em que o servidor gera o próprio `id` (via `crypto.randomUUID()`, já usado hoje para nomes de arquivo de upload). Atualizar a nota correspondente no CLAUDE.md quando implementado.

**Três gatilhos chamam a mesma função, nenhum endpoint novo:**
- **Cron semanal:** `node-cron` (nova dependência) agendado para toda sexta-feira (ex.: `0 6 * * 5`, 6h da manhã) dentro de `server.cjs`, chamando `gerarRelatoriosPendentes()`.
- **Ao subir o servidor:** roda uma vez no boot (cobre o caso da máquina estar desligada/deslogada na sexta-feira e só ligar depois).
- **Sob demanda:** o handler existente `PUT /api/clients/:id` (`server/routes/clients.cjs` ou equivalente), depois de gravar o cliente, chama `gerarRelatoriosPendentes({ apenasClientId: id })` (variante da função com filtro opcional por cliente) sempre que o corpo da requisição incluir `relatorioCadencia` — assim a agenda reflete a mudança na hora, sem esperar a próxima sexta, e sem precisar de rota nova.

### 2.5 O que NÃO muda

- O campo `relatorio_dias` em Configurações (`Cadencias.relatorio_dias`, usado por `cadenciaServico.ts`/Central de Ações para sinalizar atraso) continua existindo e funcionando como hoje — é um mecanismo de **alerta/recomendação**, distinto deste novo mecanismo de **geração automática de evento**. Não há conflito: um cliente pode ter os dois, um dos dois, ou nenhum.
- O bloco "Recorrência" do `EventFormModal` (modos Única/Cadência/Dia da semana/Avulso) continua existindo sem mudanças — serve para qualquer tipo de evento, criado manualmente, em lote. A nova cadência por cliente é um mecanismo paralelo, só para Relatório, orientado a "sempre ter o próximo pendente" em vez de "gerar um lote".

---

## 3. Sidebar — Ações Rápidas

**Mudança:** seção "Ações rápidas" do `src/components/Sidebar.tsx` troca a lista vertical simples (ícone + texto, todos iguais) por um grid 2 colunas de botões compactos (ícone em cima, label embaixo, borda sutil, mesma paleta preto-e-branco), com **5** ações: Buscar, Novo Evento, Criar Relatório, Criar Contato, Novo Lembrete. Mantém o atalho "Ctrl+K" visível junto de "Buscar". Detalhe fino de espaçamento/hover fica a critério da implementação, mas a estrutura (grid 2 colunas, ícone+label) é a diretriz.

**Mecanismo:** mesmo caminho que "Novo Evento" já usa hoje — navega para `/agenda` passando `location.state`. Hoje o estado é `{ openNewEvent: true }` (ver `AgendaLocationState` em `src/pages/AgendaPage.tsx`); passa a incluir também `initialType?: string`. O `EventFormModal` ganha uma nova prop opcional `initialType?: string` que, quando presente, inicializa o state `type` com esse valor em vez de `tipoOpcoes[0]` — cliente continua por escolher, igual ao fluxo atual de "Novo Evento".

**Arquivos afetados:**
- `src/components/Sidebar.tsx`: novos botões + props `onNewRelatorio`/`onNewContato` (ou um único `onNewEventoTipo(tipo: string)`).
- `src/App.tsx` (`Layout`): novo(s) handler(s) equivalente(s) a `handleNewEvent`, navegando com o `initialType` certo.
- `src/pages/AgendaPage.tsx`: `AgendaLocationState` ganha `initialType?: string`; repassa para `EventFormModal`.
- `src/components/EventFormModal.tsx`: nova prop `initialType`.

---

## Testes (manual — sem suíte automatizada no projeto)

1. **Histórico editável:** abrir um cliente com evento futuro "Agendado" → clicar nele → modal abre em edição → salvar → reflete na lista. Evento concluído/cancelado → não é clicável.
2. **Cadência de relatório:** configurar cliente com "1 Mês" → salvar → conferir que aparece 1 Relatório na agenda ~1 mês à frente. Configurar "Personalizado, número=2, Segunda" → conferir que cai numa segunda-feira daqui a ~2 semanas.
3. **Renovação semanal:** marcar o relatório gerado como concluído → forçar rodar `gerarRelatoriosPendentes()` (endpoint ou reiniciar servidor) → conferir que gera o próximo, e que só existe 1 futuro por vez.
4. **Cliente sem cadência / inativo / atendidoMarco:** confirmar que não gera nada.
5. **Sidebar:** clicar "Criar Relatório"/"Criar Contato" → abre modal na agenda já com o tipo certo pré-selecionado, cliente vazio.

## Escopo explicitamente fora

- Não altera o campo `relatorio_dias` de Configurações nem a lógica de `cadenciaServico.ts`.
- Não altera o bloco "Recorrência" existente do `EventFormModal`.
- Não implementa notificação/alerta quando um relatório é gerado automaticamente (só aparece na agenda).
