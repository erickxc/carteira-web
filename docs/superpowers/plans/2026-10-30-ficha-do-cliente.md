# Ficha do cliente — consulta primeiro: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a ficha-formulário (`ClienteDetailPage`) por uma ficha de consulta: cabeçalho em texto, painel de 4 blocos (prazos, reuniões, monitorIA, contatos/acessos), abas (Histórico, Cadastro, Lojas, Anotações, Tarefas) e edição do cadastro num painel que salva de uma vez.

**Architecture:** Dois utilitários puros novos (resumo do painel e agrupamento do histórico) com teste; componentes de apresentação novos em `src/components/cliente/`; `CadastroCliente` deixa de salvar por campo e vira o corpo de um modal com rascunho local. Nenhuma conta nova de cadência — tudo sai de `buildFilaCadencia`/`comPrecificacaoDoGrupo`.

**Tech Stack:** React 19 + TypeScript + Vite, vitest, design system `src/ui/`.

**Spec:** `docs/superpowers/specs/2026-10-30-ficha-do-cliente-design.md`

**Pré-requisito:** executar DEPOIS do merge da 1.7 (`feat/produtos-cliente`). A 1.7 muda nomes do motor (Plataforma 2D/2D Price, `produtos` com fase) e cria o componente de produtos da ficha (tarefa 7 da 1.7). Onde este plano cita `ServicoCad`/`servicos`, usar os nomes que a 1.7 deixar; o componente de produtos da 1.7 é reaproveitado na aba Cadastro (leitura) e no modal de edição, não reescrito.

## Global Constraints

- Ficha igual para todas as equipes — nada filtrado por login.
- Design 1.6: nada de pílula pastel nem "ponto colorido + palavra"; a cor vai no próprio número; aba/filtro ativo = traço dourado sem fundo (`Tabs`); KPIs/layouts de outras telas intocados.
- Toda mudança de status/estado/fase continua exigindo motivo; CNPJ incompleto nunca é salvo; "Pausado até" só aparece quando pedido ou já marcado.
- Senha de produto/Price nunca vai ao browser em texto (só "salva — digite para trocar").
- Datas `yyyy-MM-dd` com `parse` do date-fns, nunca `new Date(string)`.
- Navegação de volta (`backTo`/`backLabel` via `location.state`) continua como hoje.

## Review Focus

1. Cliente sem nenhum evento, sem contato, sem análise e sem rede — todos os blocos mostram a linha curta de vazio e a tela não quebra (teste em Task 1 e print em Task 6).
2. Lembrete com `eventId` de evento cancelado/fora da janela da timeline — não pode sumir: vira item próprio (teste em Task 2).
3. Precificação feita em loja-irmã do grupo — conta como "última conversa"/prazo do Price desta loja, como no resto do app (teste em Task 1).
4. Cancelar o modal de edição depois de mexer em vários campos — nada é gravado (teste em Task 4).
5. Trocar de cliente pela aba Lojas (link para ficha irmã) com o modal fechado — painel e abas recarregam o cliente novo (verificação manual em Task 6, `key={cliente.id}`).

---

### Task 1: Resumo do painel (função pura)

**Files:**
- Create: `src/utils/resumoFicha.ts`
- Test: `src/utils/resumoFicha.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ResumoFicha {
    prazos: { servico: string; independente: boolean; atraso: number | null; proximo: Date | null }[];
    ultima: EventoAgenda | null;   // última entrega/conversa CONCLUÍDA (ehConcluido), mais recente
    proxima: EventoAgenda | null;  // próxima marcada: não concluída, não cancelada/reagendada, dia >= hoje
  }
  export function resumoFicha(cliente: Cliente, clientes: Cliente[], agenda: EventoAgenda[], acoes: Acao[], cadencias: Cadencias, hoje?: Date): ResumoFicha;
  ```
- `prazos`: um por relógio do item do cliente em `buildFilaCadencia([cliente], comPrecificacaoDoGrupo(agenda, clientes), acoes, cadencias, hoje)`; serviço marcado independente no cliente entra com `independente: true`, `atraso: null`. Cliente sem produto com relógio → `prazos: []`.
- `ultima`/`proxima` olham `comPrecificacaoDoGrupo(agenda, clientes)` filtrado por `clientId`; "cancelado" = `/cancel|reagend/i`.

- [ ] **Step 1: Testes** — `resumoFicha.test.ts` com fixtures mínimas:
  - `ultima` = concluído mais recente; ignora cancelado e futuro.
  - `proxima` = mais próxima a partir de hoje (comparando pelo dia do calendário); evento de HOJE conta; status Pendente conta (o painel mostra "(pendente)" ao lado — Task 3); cancelado/reagendado não conta.
  - precificação salva na loja-irmã do mesmo `grupo` aparece como `ultima` desta loja.
  - cliente sem nada → `{ prazos: [], ultima: null, proxima: null }`.
  - serviço independente → `independente: true, atraso: null`.
- [ ] **Step 2:** `npx vitest run src/utils/resumoFicha.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3:** Implementar `resumoFicha` em `src/utils/resumoFicha.ts`.
- [ ] **Step 4:** rodar de novo → PASS.
- [ ] **Step 5:** `git commit -m "feat(ficha): resumo do painel (prazos, última e próxima)"`

### Task 2: Histórico sem duplicar lembrete

**Files:**
- Modify: `src/utils/timelineCliente.ts`
- Test: `src/utils/timelineCliente.test.ts` (criar se não existir)
- Modify: `src/pages/ClienteDetailPage.tsx` (montagem de `timelineCompleta`, linhas ~104-128)
- Modify: `src/components/cliente/TimelineCard.tsx`

**Interfaces:**
- Produces: `TimelineItem` evento ganha `lembretes?: Lembrete[]`;
  `export function agruparLembretes(itens: TimelineItem[]): TimelineItem[]` — lembrete cujo `eventId` é de um item `evento` presente em `itens` sai da lista e entra em `evento.lembretes`; os demais ficam.

- [ ] **Step 1: Testes** — lembrete com `eventId` de evento presente → some como item e aparece em `lembretes` do evento; lembrete com `eventId` de evento ausente → continua item; lembrete sem `eventId` → continua item; ordem dos itens restantes preservada.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** Implementar; em `ClienteDetailPage` aplicar `agruparLembretes` depois do filtro (no filtro "lembretes" NÃO agrupar — ali o usuário quer ver os lembretes como itens). Em `TimelineCard`, dentro do card do evento, uma linha por lembrete com ícone `Bell` (lucide), data/hora e status.
- [ ] **Step 4:** rodar → PASS; `npx tsc -b` limpo.
- [ ] **Step 5:** `git commit -m "feat(ficha): lembrete da reunião dentro do próprio evento no histórico"`

### Task 3: Cabeçalho + painel de 4 blocos

**Files:**
- Create: `src/components/cliente/CabecalhoFicha.tsx`, `src/components/cliente/PainelFicha.tsx`
- Modify: `src/components/cliente/AnaliseIACard.tsx` (prop `compacto?: boolean`: só risco + parágrafo + botão, sem colapso)
- Modify: `src/components/cliente/AcessosExternosButton.tsx` (extrair a lista de acessos para `export function ListaAcessos({ cliente }: { cliente: Cliente })`; o botão passa a usá-la no dropdown — comportamento atual intacto)

**Interfaces:**
- Consumes: `resumoFicha` (Task 1); `contatosVisiveis` (já usado na página).
- Produces:
  - `CabecalhoFicha({ cliente, onNovoEvento, onLembrete, onContatoCliente, onEditar, onRelatorios, onExcluir })` — nome (`h1.page-title`), linha de texto "Rede X · Monitor · Segmento · Status · Estado"; botões: *Novo evento* (primary), *Lembrete*, *Cliente entrou em contato*, *Editar cadastro* (secondary); menu "⋯" (`Dropdown` existente ou `Button size="icon"` + menu) com *Relatórios* e *Excluir* (danger, com `confirmDialog` atual).
  - `PainelFicha({ cliente, resumo, contatos, onWhatsApp, onVerContatos })` — grade `grid-cols-1 md:grid-cols-2`, 4 `Card`s:
    - **Prazos**: por item, nome do produto + número de dias (vencido = `text-danger` com "+N d"; no prazo = "N d" até vencer; independente = texto "independente" em `text-text-muted`). Vazio: "Sem produto com prazo".
    - **Reuniões**: "Última" (data dd/MM, tipo, assunto, 1ª linha de `resumo`/`ata` truncada) e "Próxima" (data, hora, assunto; "(pendente)" quando o status for Pendente). Vazios: "Nenhuma conversa concluída" / "Nenhuma reunião marcada".
    - **monitorIA**: `<AnaliseIACard clienteId compacto />`.
    - **Contatos e acessos**: até 3 contatos (nome, cargo, botão WhatsApp → `onWhatsApp`), "ver todos (N)" → `onVerContatos` (abre o `ContatosCard` atual); abaixo `<ListaAcessos cliente />`. Vazio: "Nenhum contato cadastrado".

- [ ] **Step 1:** Implementar os dois componentes e os ajustes de `AnaliseIACard`/`AcessosExternosButton`.
- [ ] **Step 2:** `npx tsc -b` e `npx eslint src/components/cliente` limpos; `npx vitest run` verde.
- [ ] **Step 3:** `git commit -m "feat(ficha): cabeçalho em texto e painel de consulta"`

### Task 4: Editar cadastro de uma vez

**Files:**
- Modify: `src/components/cliente/CadastroCliente.tsx`
- Create: `src/components/cliente/EditarCadastroModal.tsx`
- Create: `src/utils/patchCadastro.ts` + `src/utils/patchCadastro.test.ts`

**Interfaces:**
- Produces:
  - `export function patchCadastro(original: Cliente, rascunho: Cliente): Partial<Cliente>` — só as chaves cujo valor mudou (comparação por `JSON.stringify` do valor; arrays/objetos inclusos).
  - `CadastroCliente({ cliente, valor, onChange, somenteLeitura? })` — deixa de chamar `atualizarCliente`; controlado por `valor: Cliente` / `onChange(next: Cliente)`. `somenteLeitura` renderiza os mesmos grupos (Identificação, Situação, Produtos, Lojas, Login no Price, Relatório automático) como texto (`dl`/linhas rótulo-valor) em vez de inputs.
  - `EditarCadastroModal({ cliente, onClose })` — `ModalShell` com rascunho (`useState(cliente)`), `<CadastroCliente valor={rascunho} onChange={setRascunho} />`; *Salvar*: valida (CNPJ de loja incompleto → `toastError` e não salva; status/estado/fase mudou sem motivo → bloqueia com o pedido de motivo que o componente já tem), chama `atualizarCliente(cliente.id, patchCadastro(cliente, rascunho))` uma vez, fecha; patch vazio → só fecha. *Cancelar*: fecha sem gravar.

- [ ] **Step 1: Testes de `patchCadastro`** — nada mudou → `{}`; mudou `status` → `{ status }`; reordenou/alterou `lojasCadastro` → inclui `lojasCadastro`; campo igual com array de mesma forma → ausente.
- [ ] **Step 2:** rodar → FAIL; implementar; rodar → PASS.
- [ ] **Step 3:** Converter `CadastroCliente` para controlado + `somenteLeitura`; criar `EditarCadastroModal`. Remover o "salva ao sair de cada campo" e o aviso "As alterações são salvas ao sair de cada campo".
- [ ] **Step 4:** `npx tsc -b`, lint e `npx vitest run` verdes.
- [ ] **Step 5:** `git commit -m "feat(ficha): editar cadastro num painel que salva de uma vez"`

### Task 5: Abas e montagem da página

**Files:**
- Modify: `src/pages/ClienteDetailPage.tsx`
- Create: `src/components/cliente/LojasFicha.tsx`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: `LojasFicha({ cliente, lojasDoGrupo })` — seção "Lojas deste atendimento" (`lojasCadastro`: nome, CNPJ formatado, endereço) e "Outros atendimentos da rede" (links `Link` para `/clientes/:id` das irmãs, mantendo `state.from`).

Página nova, de cima para baixo: botão Voltar → `CabecalhoFicha` → `PainelFicha` → `Tabs` com `Histórico · Cadastro · Lojas · Anotações · Tarefas (N)`; aba lembrada com `usePersistedState('ficha:aba', 'historico')`; aba Lojas só aparece com `lojasCadastro.length > 0` ou `lojasDoGrupo.length > 1` (se a aba lembrada sumir, cair em `historico`).
- Histórico: `TimelineCard` (Task 2).
- Cadastro: `<CadastroCliente valor={cliente} somenteLeitura />`.
- Anotações: o `Textarea` + Salvar do modal atual, agora inline (único lugar de `observacao`; o campo some do cadastro).
- Tarefas: `AgilTarefasCard`; contagem de pendentes no rótulo.
- Remover: card do Ágil no topo, linha de botões do meio, modal de Anotações, card "Lojas do grupo".
- Raiz da página com `key={cliente.id}` nos componentes com estado local (painel, abas de anotação, modal).

- [ ] **Step 1:** Montar a página e `LojasFicha`.
- [ ] **Step 2:** `npm run build` e `npm test` verdes (lembrar: `server/fila/` pode falhar intermitente — reexecutar antes de investigar).
- [ ] **Step 3:** `git commit -m "feat(ficha): abas Histórico, Cadastro, Lojas, Anotações e Tarefas"`

### Task 6: Verificação visual e docs

**Files:**
- Modify: `CLAUDE.md` (parágrafo "Atendimento × loja… ficha editável (1.6.11)": a ficha agora é de consulta, cadastro editado em painel que salva de uma vez), `NOVIDADES.md` (seção da próxima versão, até ~5 bullets para o usuário).

- [ ] **Step 1:** `npm run start:dev`; prints Playwright (tema via `localStorage.tema` = `claro`/`escuro`, sessão `sessao:equipe` = `admin`) de: cliente com rede (Altese - GM…), cliente sem rede, cliente sem nenhuma reunião — claro, escuro e 390px. Conferir os 5 itens do Review Focus, inclusive navegar para a ficha irmã pela aba Lojas.
- [ ] **Step 2:** Mostrar os prints ao usuário antes de qualquer publicação.
- [ ] **Step 3:** Atualizar `CLAUDE.md` e `NOVIDADES.md`; `git commit -m "docs: ficha do cliente de consulta"`.
