# Produtos do cliente (1.7.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cadastro por produto no cliente (fase, desde, motivo, independente, link, login, senha cifrada), com histórico de fase, renomeação Monitoria→Plataforma 2D / Precificação→2D Price e coluna "No DW agora".

**Architecture:** Regras puras de produto num módulo compartilhado (`shared/produtos.cjs`) usado por back e front, como o motor de cadência. `Cliente.produtos` é a fonte; os campos antigos (`servicos`, `servicosIndependentes`, `linksServicos`, `loginPrice`, `senhaPriceCifrada`) passam a ser derivados em `syncClienteColumns`. Histórico de fase em tabela própria, no mesmo modelo de diff do `StatusHistorico`.

**Tech Stack:** Node CommonJS + Express, SQLite (`better-sqlite3`, colunas TEXT/JSON), React 19 + TS, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-30-produtos-do-cliente-design.md`

## Global Constraints

- Produtos, nesta ordem: `Plataforma 2D, Controladoria, Apura, 2D Alcance, 2D Nexus, OptiMarco, 2D Price, Protocolo GPS, Raptor`.
- Fases: `Em breve, Suspenso, Ativo, Cancelado`. Só `Ativo` entra em `servicos` derivado e na cadência.
- Renomeação: `Monitoria → Plataforma 2D`; `Precificação`/`Precificacao`/`Price → 2D Price`. Reconhecimento aceita nome antigo e novo: `ehPlataforma2D = /plataforma|monitor/i`, `eh2DPrice = /price|prec/i`.
- Mudar `fase` sem `motivoFase` novo → HTTP 400 `"Informe o motivo da mudança de fase."`.
- `senhaCifrada` (e `senhaPriceCifrada`) nunca em resposta de API.
- Relógio "nunca atendido" parte de `max(createdAt, faseDesde do produto Ativo)`.
- Migração: 2D Nexus e 2D Alcance → `Em breve`; demais → `Ativo`; `motivoFase` = `"migração para produtos (1.7)"`; produtos acrescentados pelo DW em 30/10/2026 têm `faseDesde = 2026-10-30` (lista em `dados/migracoes/2026-10-30-produtos-dw.json`, campo `clientes[].entra`).
- DW: somente leitura. Coluna `monitoria`→Plataforma 2D, `precificar`→2D Price, `alcance`→2D Alcance, `nexus`→2D Nexus, `controladoria`, `apura`, `optimarco` com o mesmo nome; Plataforma marcada em qualquer loja vale para o grupo (`Cliente.grupo`).
- Todo teste que grava isola `ONEDRIVE_ROOT` **e** `SQLITE_DIR` e recarrega os módulos (padrão de `server/routes/alvos.test.ts`).
- Textos de tela e mensagens em português.

## Review Focus

- Máquina 1.6.x salva o cliente mandando só `servicos` (sem `produtos`): nada pode se perder em silêncio, e produtos Em breve/Suspenso não podem virar Cancelado → teste na Task 3.
- Cliente legado com produto sem `faseDesde`: relógio igual ao de hoje (parte do `createdAt`) → teste na Task 2.
- Cliente/evento com nome antigo e novo misturados (`["Monitoria", "Plataforma 2D"]`): conta uma vez, sem relógio duplicado → testes nas Tasks 1 e 2.
- Produto Suspenso: some de `servicos`/cadência mas continua no cadastro com fase e motivo → teste na Task 1.
- Senha vazando por outra resposta além do GET (PUT, POST, `/bulk`) → teste na Task 3.
- Cliente sem `produtos` (estado entre publicar a 1.7 e rodar a migração): ficha, cadência e API funcionam montando produtos do formato antigo, sem gravar → teste na Task 3.
- Máquina client lendo snapshot antigo sem a tabela `ProdutosHistorico`: lista vazia, sem erro → teste na Task 4.
- Migração com máquina ainda na 1.6 (ela não reconhece "Plataforma 2D" no snapshot) → recusa gravar sem confirmação → teste na Task 10.

---

### Task 1: Módulo compartilhado de produtos

**Files:**
- Create: `shared/produtos.cjs`, `shared/produtos.d.cts`
- Test: `src/utils/produtos.test.ts` (o Vitest não lê `shared/`)

**Interfaces:**
- Produces (todas exportadas por `shared/produtos.cjs`, importadas no front como `carteira-shared/produtos.cjs`, igual a `cadenciaServico.cjs`):
  - `PRODUTOS_OFICIAIS: string[]`, `FASES: string[]`
  - `ehPlataforma2D(nome: string): boolean`, `eh2DPrice(nome: string): boolean`
  - `renomearProduto(nome: string): string` (Monitoria→Plataforma 2D etc.; outros nomes inalterados)
  - `type ProdutoCliente = { produto; fase; faseDesde; motivoFase; independente?; link?; login?; senhaCifrada? }`
  - `derivarCamposLegados(produtos: ProdutoCliente[]): { servicos: string[]; servicosIndependentes: string[]; linksServicos: Record<string,string>; loginPrice?: string; senhaPriceCifrada?: string }`
  - `produtosDeLegado(cliente, opts: { agora: string; faseInicial?: (produto) => string; desde?: (produto) => string; motivo: string }): ProdutoCliente[]`
  - `traduzirPatchLegado(produtosAtuais: ProdutoCliente[], patch, agora: string): ProdutoCliente[] | null` — `null` quando o patch não tem campo legado ou já traz `produtos`
  - `mudancasDeFase(antes: ProdutoCliente[], depois: ProdutoCliente[]): { produto: string; de: string|null; para: string; motivoMudou: boolean }[]`

- [ ] **Step 1: Write the failing tests** (`src/utils/produtos.test.ts`)
  - `ehPlataforma2D('Monitoria') && ehPlataforma2D('Plataforma 2D')` true; `ehPlataforma2D('2D Price')` false; `eh2DPrice` true para `'Precificação'`, `'Price'`, `'2D Price'`.
  - `renomearProduto('Precificação') === '2D Price'`; `renomearProduto('Apura') === 'Apura'`.
  - `derivarCamposLegados`: produtos `[Plataforma 2D Ativo independente link L, 2D Price Ativo login X senhaCifrada S, Apura Suspenso, 2D Nexus Em breve]` → `servicos` = `['Plataforma 2D','2D Price']`, `servicosIndependentes` = `['Plataforma 2D']`, `linksServicos` = `{ 'Plataforma 2D': L }`, `loginPrice` = X, `senhaPriceCifrada` = S.
  - `produtosDeLegado({ servicos: ['Monitoria','Plataforma 2D','2D Nexus'], servicosIndependentes: ['Monitoria'] }, { agora, faseInicial: p => /nexus|alcance/i.test(p) ? 'Em breve' : 'Ativo', motivo: 'm' })` → 2 itens (`Plataforma 2D` uma vez só, independente; `2D Nexus` Em breve).
  - `traduzirPatchLegado`: atuais `[Plataforma 2D Ativo, 2D Price Ativo, Apura Suspenso]`, patch `{ servicos: ['Plataforma 2D','Controladoria'] }` → 2D Price vira `Cancelado` com `motivoFase` `"alterado por versão anterior da Carteira"`, Controladoria entra `Ativo`, Apura continua `Suspenso`. Patch com `produtos` → `null`.
  - `mudancasDeFase` detecta `Ativo→Suspenso` e marca `motivoMudou=false` quando o `motivoFase` é igual ao anterior.

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/utils/produtos.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3: Implement `shared/produtos.cjs` + tipos em `shared/produtos.d.cts`** (mesmo formato de `shared/cadenciaServico.d.cts`). `listaJSON` de `cadenciaServico.cjs` para ler `servicos` que vierem como texto.
- [ ] **Step 4: Run** — mesmo comando → PASS.
- [ ] **Step 5: Commit** — `feat(produtos): regras compartilhadas de produto do cliente`

### Task 2: Cadência reconhece os nomes novos e parte de `faseDesde`

**Files:**
- Modify: `shared/cadenciaServico.cjs` (`ehToqueMonitoria`, `ehToquePrice`, `temServico`, `ehIndependente`, `servicoPadraoDoEvento`, `buildFilaCadencia` ~l.489-494), `src/utils/cadenciaServico.ts:59` (`ehServicoDeReuniao`), `src/utils/analises.ts:268-269`, e demais `/monitor/i` / `/(price|prec)/i` de nome de produto (`grep -rlE "/monitor/i|/\(price\|prec\)/i" shared src server`)
- Test: `server/dominio/cadenciaServico.test.ts`

**Interfaces:**
- Consumes: `ehPlataforma2D`, `eh2DPrice` (Task 1).
- Produces: comportamento — relógio `'Monitoria'` passa a se chamar **`'Plataforma 2D'`** e `'Price'` → **`'2D Price'`** (o campo `servico` do relógio e o valor de `opts.servico`). Quem filtra por esses textos (cards, fila) é ajustado na Task 8.

- [ ] **Step 1: Failing tests**
  - Cliente `servicos: ['Plataforma 2D','2D Price']` com reunião concluída marcada `['Plataforma 2D']` há 5 dias → relógio `Plataforma 2D` `em_dia`, `2D Price` conforme regra de hoje.
  - Evento antigo `servicos: ['Monitoria']` zera o relógio de `Plataforma 2D`.
  - Cliente `servicos: ['Monitoria','Plataforma 2D']` → um único relógio de Plataforma 2D.
  - Cliente `createdAt` 2026-05-25, `produtos: [{ produto: '2D Price', fase: 'Ativo', faseDesde: '2026-10-30' }]`, sem evento, `now` 2026-10-31 → `2D Price` **não** vencido (15 dias contam de 30/10).
  - Mesmo cliente **sem** `faseDesde` → atraso igual ao de hoje (conta do `createdAt`).
- [ ] **Step 2:** `npx vitest run server/dominio/cadenciaServico.test.ts` → FAIL.
- [ ] **Step 3:** trocar as expressões pelas funções da Task 1; em `buildFilaCadencia`, `desde` de cada relógio = maior entre `createdAt` e `faseDesde` do produto Ativo correspondente.
- [ ] **Step 4:** `npm test` inteiro → PASS (testes antigos de cadência continuam verdes; ajuste só os que comparam o texto `'Monitoria'`/`'Price'` do relógio).
- [ ] **Step 5: Commit** — `feat(cadencia): Plataforma 2D/2D Price e início pela fase do produto`

### Task 3: `produtos` no cliente — gravação, validação, derivação, segredo

**Files:**
- Modify: `server/config.cjs` (`CLIENTES_HEADERS` + `'produtos'`), `server/db.cjs` (`syncClienteColumns`), `server/dominio/clientes.cjs` (`criar`, `atualizar`), `server/routes/clients.cjs` (`semSegredo`, PUT/POST com erro 400, rota de revelar), `src/types/index.ts` (`Cliente.produtos?: ProdutoCliente[]`, `temSenha?: boolean` por produto), `src/api/client.ts` (`revelarCredenciaisProduto`)
- Test: `server/dominio/dominio.test.ts`, `server/routes/clients.price.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `syncClienteColumns(cliente)`: se `cliente.produtos` existe, sobrescreve os campos legados com `derivarCamposLegados`.
  - `clientes.atualizar(repo, id, patch)`: se `traduzirPatchLegado(atual.produtos, patch)` ≠ null, usa o resultado como `patch.produtos`; se `mudancasDeFase` tiver item com `motivoMudou=false`, lança `Object.assign(new Error('Informe o motivo da mudança de fase.'), { status: 400 })`. Produto fora de `PRODUTOS_OFICIAIS`+categorias `servico`, repetido ou fase inválida → mesmo padrão de erro 400 com mensagem específica.
  - `semSegredo(cliente)`: remove `senhaCifrada` de cada produto e acrescenta `temSenha: boolean`.
  - `POST /api/clients/:id/produtos/:produto/credenciais/revelar` → `{ login, senha }` (404 sem senha). A rota `/:id/price-credenciais/revelar` continua, lendo o produto 2D Price com fallback ao campo legado.
  - Senha nova chega no patch como `produtos[i].senha` (texto puro, só na requisição) e vira `senhaCifrada` em `clients.cjs`, como `prepararPatchPrice` faz hoje.

- [ ] **Step 1: Failing tests**
  - Atualizar fase `Ativo→Suspenso` sem mudar `motivoFase` → 400 e cliente inalterado; com motivo → 200 e `servicos` derivado sem o produto.
  - Patch legado `{ servicos: ['Plataforma 2D'] }` sobre cliente com `2D Price` Ativo e `Apura` Suspenso → `2D Price` Cancelado com o motivo da versão anterior, `Apura` Suspenso.
  - GET `/api/clients`, GET `/api/clients/:id`, PUT e POST `/bulk`: nenhuma resposta contém a string `senhaCifrada` nem `senhaPriceCifrada`; `temSenha: true` no produto com senha.
  - Revelar devolve a senha decifrada; produto sem senha → 404.
  - Cliente **sem** `produtos` (pré-migração): GET devolve `produtos` montado de `servicos`/`servicosIndependentes`/`linksServicos` (via `produtosDeLegado`, fase Ativo) e o banco continua sem a coluna preenchida; PUT de outro campo não grava `produtos`.
- [ ] **Step 2:** `npx vitest run server/dominio/dominio.test.ts server/routes/clients.price.test.ts` → FAIL.
- [ ] **Step 3:** implementar conforme Interfaces.
- [ ] **Step 4:** mesmo comando + `npm test` → PASS.
- [ ] **Step 5: Commit** — `feat(clientes): produtos com fase, motivo obrigatório e senha por produto`

### Task 4: Histórico de fase (`ProdutosHistorico`) e meses passados

**Files:**
- Create: `server/dominio/produtosHistorico.cjs`, `server/routes/produtosHistorico.cjs`
- Modify: `server/config.cjs` (`PRODUTOS_HISTORICO_HEADERS = ['id','clientId','produto','fase','motivo','mudouEm','gravadoEm']` em `HEADERS_BY_SHEET`), `server/dominio/clientes.cjs` (chamar após criar/atualizar com `produtos` no patch), `server.cjs` (boot + cron `0 4 * * *` no bloco `isServer`, ao lado do `StatusHistorico`; `app.use('/api/produtos-historico', …)`), `src/api/client.ts` (`listarProdutosHistorico`), `src/context/CarteiraContext.tsx` (carregar junto do `statusHistorico`), `src/utils/statusHistorico.ts` (`clientesEm`), `src/types/index.ts` (`ProdutoHistoricoItem`)
- Test: `server/dominio/produtosHistorico.test.ts`, `src/utils/statusHistorico.test.ts`

**Interfaces:**
- Produces: `sincronizar(repo, agora?): number` e `sincronizarSemQuebrar(repo, origem)` — mesmo contrato de `statusHistorico.cjs` (linha-base com `mudouEm = faseDesde` ou `createdAt`; nova linha só quando `fase` muda). `clientesEm(clientes, historico, dataRef, produtosHistorico?)`: com `produtosHistorico`, refaz `servicos` = produtos cuja última fase até `dataRef` é `Ativo`.
- Só o servidor escreve (fora da fila).

- [ ] **Step 1: Failing tests** — linha-base por cliente+produto; não repete sem mudança; grava `motivo` na mudança; `clientesEm` em 15/09 devolve `servicos` com `2D Price` para cliente que cancelou o 2D Price em 20/10; `getSheetDataRemota('ProdutosHistorico')` sobre um snapshot SQLite **sem** essa tabela devolve `[]` sem lançar (`server/dbSqlite.test.ts`, mesmo isolamento de `SNAPSHOT_FILE` dos testes existentes).
- [ ] **Step 2:** `npx vitest run server/dominio/produtosHistorico.test.ts src/utils/statusHistorico.test.ts` → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** mesmo comando → PASS.
- [ ] **Step 5: Commit** — `feat(produtos): histórico de fase e meses passados com os produtos da época`

### Task 5: Sincronização do Price grava no produto 2D Price

**Files:**
- Modify: `server/dw/sincronizarPrice.cjs` (~l.49 e l.69)
- Test: teste existente da sincronização (procurar `sincronizarPrice` em `server/**/*.test.ts`; se não houver, criar `server/dw/sincronizarPrice.test.ts` com `buscarDadosPrice` substituído)

**Interfaces:**
- Consumes: Task 3 (`produtos`, derivação).
- Produces: CNPJ lido de `produtos[2D Price].login` (fallback `loginPrice`); senha nova vai para `produtos[2D Price].senhaCifrada`. Continua **sem** criar produto nem mudar fase (regra 2 do comentário do arquivo).

- [ ] **Step 1: Failing test** — cliente com `2D Price` login X → após sync, `senhaCifrada` atualizada no produto e `senhaPriceCifrada` derivada igual; cliente sem 2D Price não ganha produto.
- [ ] **Step 2:** rodar → FAIL. **Step 3:** implementar. **Step 4:** rodar → PASS.
- [ ] **Step 5: Commit** — `feat(dw): sincronização do Price grava no produto 2D Price`

### Task 6: Retrato "No DW agora"

**Files:**
- Modify: `server/dw/dwPlataforma.cjs` (`buscarProdutosParametroBi(): Promise<Row[]>` — `select regexp_replace(cnpj,'\D','','g') cnpj, monitoria, controladoria, apura, alcance, nexus, optimarco, precificar from parametro_bi`)
- Create: `server/dw/retratoProdutos.cjs` (`gerarRetrato(): Promise<{ geradoEm, porCnpj }>` grava `DATA_DIR/dw-produtos.json` com escrita atômica tmp+rename), `src/utils/produtosNoDw.ts`
- Modify: `server.cjs` (boot + cron diário 4h30 no bloco `isServer`, só se `DW_PLATAFORMA_CONFIGURADO`), `server/routes/clients.cjs` ou rota nova `GET /api/dw-produtos` (lê o arquivo; `POST /api/dw-produtos/atualizar` chama `gerarRetrato` só na máquina servidora, 409 em modo client), `src/api/client.ts`
- Test: `src/utils/produtosNoDw.test.ts`, `server/dw/retratoProdutos.test.ts`

**Interfaces:**
- Produces: `produtosNoDw(cliente, retrato, clientes): Record<string, { marcado: number; total: number }>` — chave = nome oficial do produto; `total` = lojas do atendimento com CNPJ achado no retrato; Plataforma 2D vale o grupo.

- [ ] **Step 1: Failing tests** — CBraga: C. Braga com `monitoria S`, CG. Braga com `N` e mesmo `grupo` → CG. Braga `Plataforma 2D` marcado; Gomec 4 lojas com `precificar` S em 2 → `{ marcado: 2, total: 4 }`; cliente sem `lojasCadastro` → `{}`. `gerarRetrato` com `buscarProdutosParametroBi` falso grava o JSON esperado.
- [ ] **Step 2:** rodar → FAIL. **Step 3:** implementar. **Step 4:** rodar → PASS.
- [ ] **Step 5: Commit** — `feat(dw): retrato diário dos produtos marcados no DW`

### Task 7: Ficha do cliente — bloco Produtos e acesso por produto

**Files:**
- Create: `src/components/cliente/ProdutosCliente.tsx`
- Modify: `src/components/cliente/CadastroCliente.tsx` (substitui a seção "Serviços" ~l.143-190 e os links Power BI por `<ProdutosCliente>`), `src/components/cliente/AcessosExternosButton.tsx` (lista login/senha de qualquer produto com `temSenha`)

**Interfaces:**
- Consumes: Tasks 1, 3, 6 (`produtosNoDw`, `revelarCredenciaisProduto`), `atualizarCliente` do contexto.
- Produces: tela conforme spec §3 — uma linha por produto na ordem de `PRODUTOS_OFICIAIS` + "Adicionar produto"; mudar fase abre `Textarea` de motivo obrigatório antes de salvar; caixa "Independente"; link; login; senha "definir/trocar" (nunca exibida); coluna "No DW agora" (`marcado`, `n de m lojas`, `—` para Protocolo GPS/Raptor) com aviso em texto quando diverge da fase; botão "atualizar DW". Sem pílula pastel nem ponto colorido + palavra (memória do usuário).

- [ ] **Step 1:** implementar (sem teste de componente no projeto; a regra está nas Tasks 1/3/6).
- [ ] **Step 2:** `npx tsc -b` e `npx eslint src/components/cliente/` limpos.
- [ ] **Step 3:** `npm run start:dev` (refazer `.dev` com `node scripts/prepararDev.cjs`; apagar `node_modules/.vite` por mexer em `shared/`) e prints Playwright da ficha em claro, escuro e celular; mostrar ao usuário.
- [ ] **Step 4: Commit** — `feat(ficha): produtos com fase, motivo e acesso`

### Task 8: Demais telas — rótulos, reunião, filtros, importação, configurações

**Files:**
- Modify: `src/components/EventFormModal.tsx` (~l.66: opções = produtos Ativos do cliente + "ver todos"; ~l.360: mensagem "Marque ao menos um produto (Plataforma 2D ou 2D Price)."), cards com `'Monitoria'`/`'Price'` (`src/components/dashboard/AtendimentoCard.tsx`, `VencendoCard.tsx`, `AderenciaCard.tsx`, `CargaMonitorCard.tsx`, `src/hooks/useDashboardData.ts`, `src/utils/indicadoresPrazo.ts`, `gruposPrazo.ts`, `analises.ts`, `server/dominio/cadenciaServico.cjs`, `server/ia/tools.cjs` onde comparam o texto do relógio), `src/pages/ClientesPage.tsx` (importação ~l.399-400 aceita colunas `Plataforma 2D`/`2D Price` além das antigas; filtro de produto com fase, padrão Ativo), tela de categorias em Configurações (reordenar se ainda não existir)

**Interfaces:**
- Consumes: Task 2 (nomes dos relógios `'Plataforma 2D'`/`'2D Price'`), Task 1.

- [ ] **Step 1:** `grep -rn "'Monitoria'\|'Price'" src server shared` → ajustar cada ocorrência que é rótulo de relógio/produto (não o tipo de evento).
- [ ] **Step 2:** `npx tsc -b` + `npm test` → PASS.
- [ ] **Step 3:** prints locais da Visão Geral, Ações e formulário de reunião; mostrar ao usuário.
- [ ] **Step 4: Commit** — `feat(ui): Plataforma 2D e 2D Price nas telas`

### Task 9: monitorIA

**Files:**
- Modify: `server/ia/tools.cjs` (`buscar_clientes` ~l.1750 devolve `produtos` sem login/senha; nova `alterar_fase_produto`), `server/ia/normas.cjs` (gatilho: fase/produto → usar a ferramenta, só após confirmação)
- Test: `server/ia/toolsSchema.test.ts` (já cobre por varredura) + teste da ferramenta em `server/ia/tools.test.ts` ou arquivo de teste de ferramentas existente

**Interfaces:**
- Produces: `alterar_fase_produto({ clientId, produto, fase, motivo })`, `escreve: true`, todos obrigatórios; chama `clientes.atualizar` (Task 3); descrição: "só chame depois de o usuário confirmar".

- [ ] **Step 1: Failing tests** — sem `motivo` → erro; com motivo → fase muda e `AcoesIA` registra; `buscar_clientes` não contém `senhaCifrada`.
- [ ] **Step 2:** rodar → FAIL. **Step 3:** implementar. **Step 4:** `npx vitest run server/ia/` → PASS.
- [ ] **Step 5: Commit** — `feat(ia): produtos do cliente e alterar_fase_produto`

### Task 10: Migração

**Files:**
- Create: `server/scripts/migrarProdutos.cjs`, `server/scripts/migrarProdutos.test.ts`

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: `migrar(repo, { aplicar: boolean, registroDw?: object, agora }): Relatorio` + CLI (`node server/scripts/migrarProdutos.cjs [--aplicar]`). Sem `--aplicar` não grava nada. Com `--aplicar`: cópia `dados/migracoes/<AAAA-MM-DD>-produtos-1.7.antes.sqlite` (via `db.backup`) antes de qualquer escrita.
- Passos (spec §7): renomear/ordenar categorias `servico`; `produtos` de cada cliente via `produtosDeLegado` (Nexus/Alcance Em breve; `faseDesde` 2026-10-30 para `clientes[].entra` do registro DW, senão `createdAt`); corrigir `servicos` gravado como texto (6 clientes, 85 eventos em 30/10); renomear `Agenda.servicos` e chaves de `linksServicos`; linha-base em `ProdutosHistorico`; relatório de relógios antes × depois — **aborta sem gravar** se algum relógio divergir fora dos clientes com `faseDesde` novo.
- Grava pelo domínio (`clientes.atualizar` com `efeitosExternos: false` onde fizer sentido) e `repo.save` para Agenda/Categorias.
- **Trava de versão (snapshot):** antes de gravar, lê `dados/maquinas/*.log` (última linha de cada = versão atual) e lista máquinas abaixo de 1.7.0; com alguma na lista, `--aplicar` recusa e explica por quê (a 1.6 não reconhece "Plataforma 2D" no snapshot e perde o relógio). Só segue com `--aplicar --ignorar-maquinas=Bruno2D,JENIFFER-2D,...` nomeando exatamente as máquinas que o usuário confirmou que não estão em uso.

- [ ] **Step 1: Failing tests** (repo em memória; pasta `maquinas` temporária) — com um log de máquina em `1.6.17`, `aplicar` recusa sem gravar; com `--ignorar-maquinas` nomeando-a, segue; nome diferente do log não libera; simulação não altera o repo; aplicar gera `produtos` esperados para um cliente `['Monitoria','Precificação','2D Nexus']` (Plataforma 2D Ativo, 2D Price Ativo, 2D Nexus Em breve); evento `servicos: '["Monitoria"]'` (texto) vira `['Plataforma 2D']`; relógios antes = depois; relatório aponta divergência e aborta quando forçada.
- [ ] **Step 2:** rodar → FAIL. **Step 3:** implementar. **Step 4:** rodar → PASS.
- [ ] **Step 5:** rodar simulado contra a cópia `.dev` (`node --env-file=.env.dev server/scripts/migrarProdutos.cjs`), revisar o relatório, depois `--aplicar` no `.dev` e conferir a ficha no `start:dev`.
- [ ] **Step 6: Commit** — `feat(produtos): migração para a 1.7 (simula por padrão)`

### Task 11: Documentação e versão

**Files:**
- Modify: `CLAUDE.md` (seção "Produtos do cliente": modelo, campos derivados, tradução de máquina antiga, `ProdutosHistorico`, regra do relógio, DW), `ARQUITETURA.md` (tabela de módulos + entidades), `.claude/skills/monitor-ia/SKILL.md` (ferramenta nova; contagem 43/14), `NOVIDADES.md` (`## 1.7.0`, até 5 bullets para o usuário), `package.json` (`1.7.0`)

- [ ] **Step 1:** atualizar os documentos.
- [ ] **Step 2:** `npm run build` + `npm test` → PASS.
- [ ] **Step 3: Commit** — `docs: produtos do cliente (1.7.0)`
- [ ] **Step 4 (com o usuário, não automático):** confirmar resposta do responsável pelo `2d_hub`/analisador; publicar; atualizar Karol-2D; aguardar as demais máquinas em uso na 1.7 (`dados/maquinas/*.log`); `migrarProdutos.cjs` simulado em produção → revisar com o usuário → `--aplicar`.
