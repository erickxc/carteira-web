# Ficha do cliente — consulta primeiro (design)

> Aprovado na conversa em 30/10/2026. Implementar **depois da 1.7** (a tarefa 7 da 1.7 coloca os produtos com fase nesta mesma tela).

## Problema

A ficha (`src/pages/ClienteDetailPage.tsx`) é um formulário, não uma ficha: o cadastro editável (`CadastroCliente`) ocupa metade da tela, e o que se consulta ao abrir um cliente (prazos, última/próxima reunião) só aparece rolando até a linha do tempo. Além disso:

- cada reunião aparece duas vezes no histórico (o evento e o lembrete ligado a ele por `Lembrete.eventId`);
- "Observação" (no cadastro) e o botão "Anotações" editam o MESMO campo (`Cliente.observacao`);
- "Lojas (7)" (`lojasCadastro`, lojas físicas do atendimento) e "Lojas do grupo" (outros clientes com o mesmo `grupo`) são duas listas soltas;
- contatos só abrem num modal; o card do Ágil vazio ocupa meia tela no topo.

## Objetivo

Abrir a ficha e, **sem rolar**, saber: situação dos prazos, última e próxima reunião, resumo do monitorIA, com quem falar e como acessar os sistemas do cliente. A ficha é **igual para todas as equipes** (não segmenta).

## Desenho

### 1. Cabeçalho

Nome, rede, monitor, segmento, status e estado **como texto** (sem pílula pastel nem ponto colorido — regra do design system 1.6). Ações: *Novo evento* (principal), *Lembrete*, *Cliente entrou em contato*, *Editar cadastro*; menu "⋯" com *Relatórios* e *Excluir*.

Quando a separação por equipe existir, o cabeçalho mostra os dois responsáveis ("Negócios: Erick · Fiscal: …"). Até lá, o monitor único.

### 2. Painel de consulta (4 blocos)

Grade de 4 blocos no desktop (2×2), empilhados no celular:

| Bloco | Conteúdo | Fonte |
|---|---|---|
| **Prazos** | um por produto ativo com relógio (Plataforma 2D, 2D Price): dias até vencer ou de atraso; "independente" quando marcado; a cor vai no próprio número | relógios de `buildFilaCadencia` (mesmo motor da fila — nenhuma conta nova) |
| **Reuniões** | última conversa concluída (data, tipo, assunto, 1 linha do resumo/ata) e próxima marcada (data, assunto) | `agenda` com `comPrecificacaoDoGrupo`, mesmo critério de "próximo" de `useDashboardData` |
| **monitorIA** | nível de risco + parágrafo da análise + "Vamos falar sobre isso?" | `AnaliseIACard` atual, compactado |
| **Contatos e acessos** | até 3 contatos (nome, cargo, WhatsApp) + "ver todos"; links/logins dos sistemas | `contatosVisiveis`; conteúdo de `AcessosExternosButton` exposto em vez de escondido no dropdown |

Bloco sem dado mostra uma linha curta ("Nenhuma reunião marcada"), não some — o layout não pula.

### 3. Abas

`Histórico · Cadastro · Lojas · Anotações · Tarefas`, aba ativa = traço dourado sem fundo (padrão 1.6). Aba escolhida lembrada por `usePersistedState`.

- **Histórico** — a linha do tempo atual (`TimelineCard`, mesmos filtros e janela), com uma mudança: lembrete com `eventId` de um evento presente na lista **não vira item próprio**; aparece como linha com ícone de sino (lucide `Bell`) dentro do card do evento. Lembrete sem evento (ou de evento fora da lista) continua item próprio.
- **Cadastro** — tudo em leitura: identificação, situação, produtos com fase (componente da 1.7), relatório automático, login do Price (senha nunca exibida).
- **Lojas** — "Lojas deste atendimento" (`lojasCadastro`) e "Outros atendimentos da rede" (links para as fichas irmãs). Aba some quando não há nenhuma das duas.
- **Anotações** — o campo `observacao`, editável aqui (único lugar), com Salvar.
- **Tarefas** — `AgilTarefasCard`; o rótulo da aba traz a contagem de pendentes.

### 4. Editar cadastro

*Editar cadastro* abre um painel (ModalShell) com os campos de hoje (`CadastroCliente`), **salvando tudo de uma vez** em *Salvar* (uma chamada `atualizarCliente` com o patch dos campos alterados); *Cancelar* descarta. Some o "salva ao sair de cada campo". Regras que continuam: CNPJ incompleto não salva; mudança de status/estado/fase exige motivo (regra do usuário); "Pausado até" só quando pedido ou já marcado.

## Fora do escopo

Monitor por equipe (vem na separação 2b), dossiê novo (subprojeto 3), mudanças na Carteira (lista).

## Testes

- Utilitário puro de agrupamento do histórico (lembrete com `eventId` dentro do evento; lembrete órfão continua item) — teste unitário.
- Resumo do painel (último concluído, próximo marcado, prazos por produto) como função pura testada, reaproveitando o motor.
- Editar cadastro: Cancelar não grava; Salvar manda um único patch só com o que mudou.
- Prints (claro, escuro, celular) de um cliente com rede, um sem rede e um sem reunião antes de publicar.

## monitorIA

Nada novo para o agente: a ficha só reorganiza dados que as ferramentas já expõem (`buscar_clientes`, `buscar_historico_eventos`, `buscar_proximas_reunioes`).
