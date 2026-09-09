# Design: módulo Ágil — campos personalizados (Spec 2 de 2)

Data: 2026-09-11

## Contexto

Segunda metade do redesenho do Ágil (primeira: `2026-09-09-agil-estrutura-design.md`). Já fechados naquela spec: sidebar, Iniciativa como entidade, Frente, remoção de raia, filtros, 5 colunas padrão. Cor por prioridade e cor por coluna **já existiam antes da Spec 1** (`PRIORIDADE_BARRA`/`PRIORIDADE_TEXTO` no card, `AgilColuna.cor`) — não sobrou nada de "sistema de cores" pra desenhar aqui além do que a Spec 1 já tratou (cor de Frente).

O que falta mesmo: **campos personalizados tipados**. Definido na conversa de brainstorming: usuário quer "o campo que eu quiser com a categoria do dado: pessoa, data, seleção etc" — 4 tipos (texto/número, seleção, data, pessoa), não uma lista fechada de tipos "prontos".

## Modelo de dados

Definição do campo é **por board** (mesmo espírito de Frente-por-board na v1 antiga, mas aqui faz sentido de verdade: um quadro de vendas quer campo "Valor do contrato", um quadro de suporte quer "Cliente afetado" — não são conceitos universais como Frente).

```ts
export interface AgilCampoPersonalizado {
  id: string;
  boardId: string;
  nome: string;
  tipo: 'texto' | 'numero' | 'data' | 'selecao' | 'pessoa';
  /** Só relevante quando tipo === 'selecao' — lista de opções cadastradas. */
  opcoes?: string[];
  ordem: number;
  createdAt: string;
}
```

`AgilTarefa` ganha `camposPersonalizados?: string` — JSON string `{ [campoId]: valor }` (mesmo padrão de `camposCard`/`servicos`/`checklist`: SheetJS não persiste objeto aninhado). Valor sempre string na serialização (número e data também, formatados); `pessoa` reaproveita a lista de monitores já existente (`opcoesPorTipo('monitor')`), não é texto livre.

**Apagar a definição de um campo não apaga o valor gravado nas tarefas** — o valor órfão fica no JSON sem mais aparecer em lugar nenhum (mesmo espírito não-destrutivo do resto do módulo: `frenteId`/`iniciativaId` órfãos também não são limpos ativamente, só param de resolver pra algo visível).

## Backend

Par domínio/rota igual às outras 8 entidades do Ágil: `server/dominio/agilCamposPersonalizados.cjs` (CRUD + reordenar, sem cascade — nada depende dele além do board dono), `server/routes/agilCamposPersonalizados.cjs`, entrada na fila (`agilCamposPersonalizados`), `AGIL_CAMPOS_PERSONALIZADOS_HEADERS` em `config.cjs`, schema em `validation.cjs` (valida `tipo` contra o enum, `opcoes` só aceito quando `tipo === 'selecao'`).

Cascade de **board** (`agilBoards.cjs::remover`) passa a limpar também `AgilCamposPersonalizados` do board removido — mesmo padrão de colunas/iniciativas.

`AgilTarefa.camposPersonalizados` entra em `AGIL_TAREFAS_HEADERS`.

## Frontend

- **Gestão dos campos**: novo modal `CamposPersonalizadosManagerModal` (por board, mesmo padrão do `IniciativasManagerModal`) — criar/editar/remover campo, escolher tipo, e pra `selecao` uma lista de opções (texto livre, uma por linha, mesmo padrão simples já usado noutros lugares do app). Acessível pelo mesmo botão-grupo de config do quadro em `AgilPage.tsx` (ao lado de "Iniciativas").
- **Preenchimento**: `TaskDetailModal` renderiza uma seção "Campos personalizados" com um input por campo definido no board — `Input` pra texto/número, `Input type="date"` pra data, `SelectField` pra seleção, `SelectField` (opções = monitores) pra pessoa. Salva junto do resto do payload da tarefa.
- **Exibição no card**: **fora de escopo** — o card já tem 6 campos opcionais configuráveis (Spec 1); adicionar N campos personalizados dinâmicos ali é complexidade sem pedido explícito (YAGNI). Quem quiser ver o valor abre a tarefa.
- **Filtro**: **fora de escopo** nesta rodada — a barra de filtros da Spec 1 cobre os campos fixos; estender pra campos dinâmicos por board é uma segunda dimensão (filtro muda conforme o board selecionado) que não foi pedida com urgência. Fica anotado como próximo passo natural se o uso pedir.

## Testes

`server/dominio/agil.test.ts` ganha casos pro novo domínio: criar/editar/remover campo, e cascade de board limpando `AgilCamposPersonalizados`.

## Fora de escopo

- Exibição no card e filtro por campo personalizado (YAGNI, ver acima).
- Cor por prioridade/coluna: já implementado antes da Spec 1, nada a fazer aqui.
