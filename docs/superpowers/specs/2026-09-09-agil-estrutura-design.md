# Design: módulo Ágil — estrutura e navegação (Spec 1 de 2)

Data: 2026-09-09

## Contexto

O módulo Ágil (Kanban interno, `src/components/agil/` + `server/dominio/agil*.cjs`) está funcional mas confuso de usar. Diagnóstico do usuário: *"swimlanes, área de trabalho, muita coisa tá confusa"*, e o que ele quer que o quadro seja é mais simples do que o que está construído hoje: Iniciativas, Tarefas, colunas de período, prioridade/responsável/prazo/campos personalizados, e cores.

Esta é a **primeira de duas specs**. Aqui entra a reorganização estrutural (navegação, hierarquia, remoção do que confunde, filtros). A segunda spec cobre **campos personalizados tipados** (texto/número, seleção, data, pessoa) e o restante do sistema de cores — decisão explícita do usuário de fazer a estrutura primeiro e usar o quadro reorganizado antes de desenhar os campos personalizados.

### Estado atual relevante

| Conceito | Como está hoje |
|---|---|
| Área de trabalho | `AgilWorkspace` — agrupa boards; escolhida por um `Dropdown` no breadcrumb do topo (`AgilPage.tsx:72`), que só aparece quando há 2+ |
| Quadro | `AgilBoard` — colunas + tarefas. Também escolhido por `Dropdown` no mesmo breadcrumb |
| Iniciativas | **Board companheiro**: todo board novo nasce com um board irmão `ehIniciativas: true`, ligado por `iniciativasBoardId`, renderizado empilhado acima. `AgilTarefa.iniciativaId` aponta pra uma *tarefa* desse board irmão |
| Raia (swimlane) | `AgilSwimlane` — divisão horizontal livre, nomeada à mão. Todo board nasce com uma raia "Geral" (`agilBoards.cjs:17`) |
| Colunas | `AgilColuna` — 2 níveis via `parentId`, WIP limit, cor. Board novo nasce com 3: "A Fazer / Em Andamento / Concluído" |
| Etiquetas | `AgilTarefa.labels: string[]` — texto livre digitado à mão, múltiplas, sem cor, sem cadastro |
| Frente | **Existiu e foi removida** em `6207a26` (02/09/2026), por decisão do usuário: *"não estava sendo usada e só somava complexidade"*. Era categoria colorida por tarefa, com entidade própria e gerenciador |
| Cores | Já existem: `AgilColuna.cor` (cor por coluna) e `PRIORIDADE_COR` (cor por prioridade, em `TaskCard`/`TaskDetailModal`) |
| Testes | **Zero.** Nenhum `.test.*` cobre o módulo, inclusive o cascade delete de 4 níveis |

---

## 1. Raia (swimlane) sai do modelo

**Problema:** a raia é uma divisão horizontal totalmente livre, sem uso padronizado — o usuário criava raias sem saber o que elas deveriam significar, e o quadro ganhava uma segunda dimensão que ninguém lia. Foi apontada nominalmente como fonte da confusão.

**Mudança:** remoção completa. Cards de responsáveis diferentes convivem na mesma coluna, sem agrupamento horizontal. O que a raia tentava resolver ("ver só o que é de tal pessoa") passa a ser resolvido por **filtro** (seção 4).

**Remover ponta a ponta** (mesmo alcance do commit `6207a26`, que serve de referência de "como remover uma feature deste módulo por completo"):
- `src/types/index.ts`: `AgilSwimlane`, `NovaAgilSwimlane`, `AgilTarefa.swimlaneId`
- `server/dominio/agilSwimlanes.cjs`, `server/routes/agilSwimlanes.cjs`
- `server/fila/entidades.cjs`: entrada `agilSwimlanes`
- `server/config.cjs`: `AGIL_SWIMLANES_HEADERS` + entrada em `HEADERS_BY_SHEET`; coluna `swimlaneId` de `AGIL_TAREFAS_HEADERS`
- `server/db.cjs`: criação da sheet `AgilSwimlanes` (linhas 205, 261) e a migração da raia "Geral" (linhas ~275-289)
- `server/validation.cjs`: `agilSwimlaneCreateSchema`, `agilSwimlaneUpdateSchema`, `agilReorderSwimlaneItemSchema`, e `swimlaneId` de `agilReorderTarefaItemSchema`
- `server/dominio/agilBoards.cjs`: `criarColunasEswimlanePadrao` deixa de criar a raia; cascade delete deixa de limpar `AgilSwimlanes`
- `src/api/client.ts` + `src/context/CarteiraContext.tsx`: CRUD e estado de swimlanes
- `src/components/agil/`: `SwimlaneFormModal` (se existir), agrupamento por raia no `KanbanBoard`, ids de drag-and-drop que carregam `swimlaneId`

**Dado existente:** as tarefas atuais têm `swimlaneId` preenchido. A remoção da coluna já as "desagrupa" naturalmente — nenhuma tarefa se perde, porque `colunaId` (que define onde o card aparece) não é tocado. Seguindo o precedente de `removerAgilFrentes.cjs`, a limpeza do dado é um **script pontual** (`server/scripts/removerAgilSwimlanes.cjs`, com `--dry-run`), rodado à mão na máquina servidora — nunca no boot, porque é destrutivo e irreversível.

---

## 2. Iniciativa vira entidade própria (épico), não board companheiro

**Problema:** hoje Iniciativa é um *board irmão* cujas *tarefas* são as iniciativas. Isso significa: todo board novo cria silenciosamente um segundo board, o seletor tem que filtrar `ehIniciativas` pra não mostrá-lo, a tela renderiza dois `KanbanBoard` empilhados, e `iniciativaId` aponta pra uma tarefa em outro board. É a maior fonte de complexidade acidental do módulo, e conceitualmente errado: uma iniciativa não tem etapas de fluxo próprias, ela **agrupa** tarefas que têm.

**Mudança:** `AgilIniciativa` passa a ser entidade de primeira classe, dentro do mesmo quadro.

```ts
export interface AgilIniciativa {
  id: string;
  boardId: string;
  titulo: string;
  descricao?: string;
  /** Hex #RRGGBB — identifica a iniciativa visualmente no card da tarefa. */
  cor?: string;
  ordem: number;
  createdAt: string;
}
export type NovaAgilIniciativa = Omit<AgilIniciativa, 'id' | 'ordem' | 'createdAt'>;
```

`AgilTarefa.iniciativaId` permanece no tipo, mas passa a referenciar `AgilIniciativa.id` em vez de uma tarefa do board irmão.

**Sai:** `AgilBoard.iniciativasBoardId`, `AgilBoard.ehIniciativas`, a criação recursiva do board companheiro (`agilBoards.cjs:39-47`), a remoção em cascata do companheiro (`agilBoards.cjs:79-81`), o filtro `!b.ehIniciativas` no seletor (`AgilPage.tsx:42`) e o `KanbanBoard` empilhado (`AgilPage.tsx:134-141`).

**Entra:** `server/dominio/agilIniciativas.cjs` + `server/routes/agilIniciativas.cjs` (mesmo par domínio/rota das outras 7 entidades), entrada `agilIniciativas` em `server/fila/entidades.cjs`, `AGIL_INICIATIVAS_HEADERS` em `server/config.cjs` + `HEADERS_BY_SHEET`, criação da sheet em `server/db.cjs`, schemas em `server/validation.cjs`, CRUD em `src/api/client.ts` e estado em `CarteiraContext`.

**Migração do dado:** cada board com `ehIniciativas: true` tem suas tarefas convertidas em linhas de `AgilIniciativas` (preservando o `id`, para que `AgilTarefa.iniciativaId` das tarefas existentes continue apontando para o registro certo sem reescrita), e o board companheiro é apagado. Mesmo padrão de script pontual com `--dry-run` da seção 1.

**Onde a Iniciativa aparece na UI:** seletor no `TaskDetailModal` (escolher a iniciativa da tarefa) e indicador no `TaskCard`. A gestão das iniciativas do quadro fica na configuração do quadro (seção 3).

---

## 3. Sidebar interna do módulo + configuração por quadro

**Problema:** hoje toda a navegação mora num breadcrumb apertado no topo, com dois `Dropdown` que só aparecem quando há 2+ itens (`AgilPage.tsx:69`, `:91`) — ou seja, a estrutura fica invisível justamente para quem tem pouca coisa cadastrada, e ilegível para quem tem muita. Somado ao board de Iniciativas empilhado e às raias, era impossível responder "onde eu estou" de olhada.

**Mudança:** nova sidebar **interna ao módulo** (não a `Sidebar.tsx` global do app), à esquerda da área do quadro, com:

- Lista de **Áreas de trabalho**, cada uma expansível para os seus **Quadros** — a estrutura inteira visível de uma vez, sem dropdown
- Ações de criar Área de trabalho / Quadro
- **Configurações do Ágil** (global): gestão de Frentes (seção 5)
- **Configurações do quadro** (por quadro): campos visíveis no card, colunas daquele quadro, iniciativas daquele quadro

As colunas padrão (seção 6) **não** ganham tela de configuração global: são o estado inicial de um quadro novo, e cada quadro já pode ajustar as suas depois da criação. Uma tela para editar o padrão seria configuração de configuração, sem ninguém tendo pedido.

O `KanbanBoard` ocupa o restante da largura, sem mudança na sua renderização interna além da remoção das raias.

**Novo componente:** `src/components/agil/AgilSidebar.tsx`. `AgilPage.tsx` passa a ser layout de duas colunas (sidebar + conteúdo) e perde o breadcrumb com dropdowns. A persistência da seleção continua em `usePersistedState` (`agil:workspaceId` / `agil:boardId`), inclusive a navegação vinda de outras telas via `location.state` (`AgilPage.tsx:26-33`) — que não muda.

**Configurações visíveis no card** (por quadro): quais campos o card mostra sem abrir — responsável, prazo, prioridade, Frente, iniciativa, número. Novo campo em `AgilBoard`:

```ts
/** JSON string com os campos exibidos no card deste quadro. Serializado
 *  como string porque campos aninhados não sobrevivem ao json_to_sheet
 *  do SheetJS (ver CLAUDE.md) — mesmo padrão de EventoAgenda.checklist. */
camposCard?: string;
```

Ausente/vazio = todos os campos visíveis (comportamento atual), então nenhum quadro existente muda de aparência ao subir a versão.

---

## 4. Filtros no quadro

**Problema:** não existe filtro nenhum hoje — com o quadro cheio, achar uma tarefa é rolagem visual. É também o que precisa existir antes de remover as raias, já que era a raia que dava a única forma de segmentar a visão.

**Mudança:** barra de filtros acima do quadro, **combináveis** (vários ao mesmo tempo, em AND), cobrindo todos os campos da tarefa:

| Filtro | Campo |
|---|---|
| Responsável | `responsaveis[]` (contém) |
| Frente | `frenteId` |
| Prioridade | `prioridade` |
| Prazo | `dueAt` — atrasada (< hoje) / vencendo (próximos 7 dias) / sem prazo |
| Coluna | `colunaId` |
| Iniciativa | `iniciativaId` |
| Bloqueada | `bloqueado` |

Filtro é **estado de UI puro**, nada persistido no banco (mesma decisão dos filtros de `ClientesPage`): `usePersistedState` por quadro, para a escolha sobreviver ao recarregar a página sem virar dado compartilhado entre usuários. A filtragem é client-side sobre as tarefas já em memória no `CarteiraContext` — não há endpoint novo.

Campos personalizados (Spec 2) entram nesta mesma barra quando existirem.

---

## 5. Frente substitui Etiquetas

**Contexto que importa:** a Frente já existiu e foi removida por decisão do usuário há uma semana (`6207a26`), sob a justificativa de não estar sendo usada. O que mudou é que agora existe uma taxonomia concreta — **Monitoria, Análise, Alvos**, os marcos do dia a dia da 2D — e um papel visual definido. A decisão de trazê-la de volta foi tomada com esse histórico na mesa.

**Diferença central em relação à versão removida:** a Frente **não convive** com o campo Etiquetas — ela o substitui. A versão anterior somava um conceito de marcação ao lado de outro (`labels` livre + Frente cadastrada), que é exatamente a duplicação que tornava o quadro confuso.

```ts
export interface AgilFrente {
  id: string;
  nome: string;
  /** Hex #RRGGBB — pinta o card da tarefa e o cabeçalho do modal. */
  cor: string;
  ordem: number;
  createdAt: string;
}
export type NovaAgilFrente = Omit<AgilFrente, 'id' | 'ordem' | 'createdAt'>;
```

- **Global**, não por quadro: são marcos da operação da 2D, iguais em qualquer quadro. Cadastradas em Configurações do Ágil (na sidebar), com nome e cor.
- `AgilTarefa.frenteId?: string` — **uma** por tarefa (não múltiplas).
- **Sai** `AgilTarefa.labels: string[]`, junto do campo "Etiquetas" no `TaskDetailModal` (`:261`) e dos chips no `TaskCard` (`:208`). O dado de labels existente é descartado — mesmo tratamento por script pontual das seções 1 e 2.

**Cor:** a cor da Frente pinta o card da tarefa e o cabeçalho do `TaskDetailModal`, com **precedência sobre a cor de prioridade** — restaurando o comportamento que o commit de remoção havia desfeito (*"cor do cabeçalho do modal passa a vir só da prioridade (a Frente tinha precedência ali)"*). Sem Frente, cai na cor da prioridade, como hoje. `src/utils/cor.ts::corContrastante` (já existente) resolve a cor do texto sobre a cor da Frente.

---

## 6. Colunas padrão de período

**Mudança:** `TITULOS_PADRAO` em `server/dominio/agilBoards.cjs:8` passa de 3 para 5 colunas: **Backlog, A fazer, Em andamento, Validação, Concluído**, com `CORES_PADRAO` estendido para 5 valores.

Permanecem **editáveis** depois da criação (renomear, adicionar, remover, reordenar, WIP limit, 2 níveis) — decisão explícita do usuário: padrão bom de saída, não camisa de força. Quadros já existentes não são migrados; só quadro novo nasce com as 5.

---

## 7. PIN opcional por Área de trabalho

**Contexto:** o app não tem autenticação, por decisão de arquitetura documentada no `CLAUDE.md` (LAN, sem contas, sem sessão). O usuário quer poder proteger uma área de trabalho de time interno, e a expectativa foi alinhada explicitamente: **barreira leve contra abrir por engano, não segurança real**.

**Mudança:** `AgilWorkspace.senha?: string` — PIN de 4 dígitos, opcional, definido na criação/edição da área. Ao selecionar na sidebar uma área que tem PIN, um prompt pede os 4 dígitos; acertando, a área abre e fica desbloqueada nessa máquina (`sessionStorage`, some ao fechar o navegador).

**Explicitamente fora:** hash de senha, sessão, controle de acesso no backend. A rota continua devolvendo os dados de qualquer área a quem chamar a API — o PIN é verificação de UI. Isso está coerente com o resto do app (sem autenticação, HTTP puro na LAN) e **a tela precisa deixar claro** que é cortesia entre colegas, não proteção — mesmo princípio já adotado no filtro de monitor e no painel de ações do agente (`CLAUDE.md`, "Privacidade das conversas: identidade voluntária, não autenticação"). Prometer segurança que não existe seria pior que não ter o campo.

---

## 8. Nomenclatura em português

Pedido explícito do usuário. Troca de **rótulos de UI** apenas — nomes de tipo, entidade, sheet e rota permanecem como estão, para não transformar renomeação de texto em migração de dado:

| Hoje na tela | Passa a ser |
|---|---|
| Board | Quadro |
| Workspace / Área de trabalho | Área de trabalho (uniformizar — hoje oscila) |
| Swimlane / Raia | *(removido)* |
| Etiquetas | Frente |

---

## 9. Testes

O módulo tem **zero cobertura** hoje, incluindo o cascade delete de 4 níveis (Área → Quadro → Coluna → Tarefa → Subtarefa/Comentário). Como esta spec mexe justamente nesse cascade (remove raia, adiciona iniciativa) e no schema de 3 entidades, os testes entram junto — não como rodada separada depois:

- `server/dominio/agilIniciativas.test.ts` — CRUD; remoção de iniciativa **não** apaga as tarefas dela, só limpa `iniciativaId` (não-destrutivo, mesmo espírito do resto do módulo)
- `server/dominio/agilFrentes.test.ts` — CRUD; remoção de Frente limpa `frenteId` das tarefas que a usavam
- `server/dominio/agilBoards.test.ts` — cascade delete ajustado: apaga colunas, tarefas, subtarefas, comentários e iniciativas do quadro; **não** cria mais board companheiro
- `server/dominio/agilWorkspaces.test.ts` — cascade em cadeia (área → quadros → tudo abaixo)
- Filtros: teste de unidade puro sobre a função de filtragem, extraída para `src/utils/agilFiltros.ts` (testável sem montar componente, mesmo padrão de `src/utils/cadenciaServico.ts`)

Isolamento obrigatório de `ONEDRIVE_ROOT` **e** `SQLITE_DIR` com `require` fresco dos módulos que cacheiam caminho — inclusive `machine.cjs`, pelo motivo documentado no `CLAUDE.md` (teste mal isolado já escreveu na fila real e no banco de produção). Referência: `server/ia/modoCliente.test.ts`.

---

## Ordem de implementação

A ordem importa por causa da fila multi-máquina: **entidade nova precisa estar na máquina servidora antes de qualquer cliente enfileirar operação com ela**, senão o controller rejeita com `"Controller: entidade desconhecida"` e a operação fica `skipped` (`CLAUDE.md`).

1. Entidades novas (`AgilIniciativa`, `AgilFrente`): domínio + rota + fila + headers + validação + testes
2. Migração de dado: script de conversão do board de Iniciativas → entidade, com `--dry-run`
3. Remoção da raia (backend + frontend) + script de limpeza
4. Remoção de `labels` em favor de `frenteId` no frontend
5. Sidebar + configuração por quadro
6. Filtros
7. Colunas padrão de período (5) + PIN da área de trabalho
8. Nomenclatura

---

## Fora de escopo desta spec

- **Campos personalizados tipados** (texto/número, seleção, data, pessoa) — Spec 2. É um sistema próprio (definição de campo por quadro + valor por tarefa) e não depende de nada aqui além dos filtros já estarem prontos para receber mais dimensões.
- **Cor por prioridade e cor por coluna** — já existem (`PRIORIDADE_COR`, `AgilColuna.cor`); revisão de paleta fica para a Spec 2, junto do resto do sistema de cores.
- **Anexo em tarefa** — ausente hoje, não foi pedido.
- **Ferramenta do monitorIA para o Ágil** — o checklist do `CLAUDE.md` manda avaliar isso ao terminar qualquer implementação. A avaliação fica para o fim da implementação desta spec, quando o modelo de dados estiver estável: expor um quadro em reestruturação ao agente só criaria ferramenta para um contrato que vai mudar.
