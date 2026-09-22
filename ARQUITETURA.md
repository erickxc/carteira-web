# Arquitetura — Carteira Web

Referência técnica de como o sistema é construído. Para regras de negócio,
histórico de bugs reais e decisões de projeto (o "porquê" de cada detalhe não
óbvio), ver **`CLAUDE.md`** — este documento é o mapa; aquele é o comentário de
código estendido. Onde os dois se sobrepõem, `CLAUDE.md` é a fonte mais
detalhada (e mais viva: atualizado a cada sessão de trabalho); este arquivo
prioriza dar uma visão de conjunto rápida de se ler.

**Nome do produto**: CARTEIRA 2D — carteira de monitoria da 2D Consultores.
**Nome do repositório/pastas**: "Carteira Web" (histórico, é caminho real de
produção, não renomear).

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + TypeScript + Vite, Tailwind, `react-router-dom` |
| Backend | Node.js + Express, CommonJS (`.cjs`, sem build step) |
| Persistência real | SQLite (`better-sqlite3`), por máquina, fora do OneDrive |
| Backup/legado | Excel (`.xlsx`, via `xlsx`/SheetJS) — hoje só espelho de leitura |
| Sincronização multi-máquina | Fila de arquivos JSON transportada pelo OneDrive |
| Empacotamento desktop | `pkg` (launcher `.exe`, Node portátil embutido) |
| IA | Ollama (local/cloud) ou Claude Code CLI como subprocesso, via MCP |
| Testes | Vitest (`server/**/*.test.ts`, `src/**/*.test.ts`, `launcher/**/*.test.ts`) |

## 1. Modelo de dados e persistência

**Isto é o ponto mais importante de entender antes de mexer em qualquer
rota/dominio — e diverge do que uma leitura superficial do nome dos arquivos
sugere.**

```
                         ┌─────────────────────────┐
                         │  Karol-2D (máquina       │
                         │  "server" — dona do      │
                         │  banco real)             │
                         │                          │
  requisições HTTP  ───► │  server.cjs → routes/ →  │
  (LAN via Apache)       │  dominio/ → repo.cjs →   │
                         │  dbSqlite.cjs            │
                         │        │                 │
                         │        ▼                 │
                         │  SQLite (better-sqlite3)  │
                         │  %LOCALAPPDATA%\...\      │
                         │  carteira.sqlite          │
                         │  (LOCAL, fora do OneDrive)│
                         └─────────┬────────────────┘
                                   │ snapshot periódico (cron)
                                   ▼
                    OneDrive (DATA_DIR) — transporte/backup
                    ├── database_dev.xlsx      (espelho, só leitura humana/legado)
                    ├── uploads/                (anexos — arquivo físico real)
                    ├── backups/                (snapshots .xlsx e .sqlite datados)
                    └── filas/
                        ├── pendentes/           ◄── outras 3 máquinas escrevem aqui
                        ├── resultados/
                        ├── processadas/AAAA-MM/
                        └── log/aplicadas-AAAA-MM.jsonl

  ┌──────────────────────────┐
  │  Máquina "client"         │  isClienteAtivo, mesma UI/`.exe`, mesma release
  │  (qualquer hostname ≠     │  Escrita local no SQLite é BLOQUEADA
  │  Karol-2D)                │  (dbSqlite.cjs:proibirEscritaEmModoCliente)
  │                            │  Mutação de rota → grava operação JSON em
  │                            │  filas/pendentes/ (via OneDrive) → aguarda
  │                            │  o controller da "server" aplicar e devolver
  │                            │  ack em filas/resultados/
  └──────────────────────────┘
```

- **O banco real é SQLite, por máquina, fora do OneDrive** (`server/config.cjs`
  → `SQLITE_DIR`/`SQLITE_FILE`, hoje em `%LOCALAPPDATA%\CarteiraWeb\` na
  máquina Karol-2D). `server/dbSqlite.cjs` é quem lê/escreve.
- **`database_dev.xlsx` (dentro do OneDrive) não é mais a fonte de escrita** —
  é um **espelho** regenerado por `server/backupSqlite.cjs`
  (`rodarBackupSqlite()`, cron em `server.cjs`), só pra quem precisa abrir o
  Excel direto ou como plano B histórico. `server/db.cjs` (o leitor/escritor
  de xlsx original) ainda existe no código mas não é mais o caminho principal
  das rotas.
- **Modo de execução decidido pelo hostname** (`server/modo.cjs`): só a
  máquina cujo hostname bate com `CARTEIRA_HOSTNAME_SERVIDOR` (default
  `Karol-2D`) roda em modo `server` (grava direto no SQLite, roda os crons de
  backup/relatórios/controller da fila). Qualquer outro hostname roda em modo
  `client`: nunca escreve no SQLite local, e toda mutação de rota vira uma
  operação na fila. O `.exe` é idêntico em todas as máquinas — não há
  configuração manual do modo no caminho normal.
- **A fila usa o próprio OneDrive como transporte** entre as até 4 máquinas
  (inclusive fora da LAN, já que OneDrive sincroniza pela internet) —
  `server/fila/`: `caminhos.cjs` (estrutura de pastas), `mutacao.cjs`/
  `escrever.cjs` (cliente grava a operação), `controller.cjs` (só roda na
  `server`: lê pendentes, aplica via `aplicar.cjs` sobre o mesmo `repo.cjs` de
  domínio, grava ack + move pra `processadas/`), `snapshot.cjs` (publica o
  estado atual pra leitura das máquinas cliente), `pendentes.cjs`/`status.cjs`
  (consulta de status pelo front). Modelo de consistência: **last-write-wins**,
  ordenado por `createdAt` com desempate por `machineId`+`seq`
  (`server/machine.cjs`) — não é forte, é "melhor esforço" (documentado nos
  comentários de `controller.cjs`).
- **Nem toda entidade passa pela fila** — `server/fila/entidades.cjs` define
  a lista (`ENTIDADES`). Ficam de fora de propósito: `Categorias`/`Cadencias`
  (config global rara, sem `recordId`, só leitura em modo cliente) e
  `AnalisesIA`/`AnalisesIAHistorico` (saída de análise automática, só roda no
  servidor). `AgilHistorico` está em `HEADERS_BY_SHEET` mas fora de
  `ENTIDADES` (log derivado, não editável remotamente).
- **Entidades/tabelas** (schema fixo por "sheet", herdado do modelo Excel
  original — `HEADERS_BY_SHEET` em `server/config.cjs`): `Clientes`, `Agenda`,
  `AgendaSeries`, `Lembretes`, `Categorias`, `Acoes`, `Modelos`, `Cadencias`,
  `AgilWorkspaces`, `AgilBoards`, `AgilColunas`, `AgilSwimlanes`,
  `AgilTarefas`, `AgilSubtarefas`, `AgilFrentes`, `AgilCamposPersonalizados`,
  `AgilComentarios`, `AgilConexoes`, `AgilHistorico`, `AnalisesIA`,
  `AnalisesIAHistorico`, `AcoesIA` (append-only), `UsoIA` (append-only),
  `MemoriaIA`.
- **Campos aninhados (array/objeto)** são serializados pra JSON string antes
  de gravar (herança do modelo Excel, mantida no SQLite por compatibilidade de
  schema) — ver `serialize*`/`deserialize*` em `src/api/client.ts`.
- **Anexos**: arquivo físico via `multer`, sempre em `uploads/` dentro do
  OneDrive (`DATA_DIR`) — isso não mudou com a migração pro SQLite, porque o
  arquivo em si precisa estar acessível por qualquer máquina.
- **IDs são gerados no frontend** (`uuid`), nunca no servidor.

### Fluxo de escrita (server) vs (client)

```
Rota HTTP → server/routes/*.cjs → server/dominio/*.cjs (repo.cjs) → dbSqlite.cjs
                                          │
                        modo "client"? ──┤── sim → server/fila/mutacao.cjs
                                          │         (grava JSON em filas/pendentes/,
                                          │          devolve 202 otimista pro front)
                                          └── não (server) → escreve direto
```

## 2. Backend (`server/`)

- **`server.cjs`** — bootstrap: registra middlewares (CORS restrito, bind
  `127.0.0.1` sempre), monta todas as rotas (`/api/...`), sobe os crons
  (backup Excel/SQLite, relatórios automáticos, séries de agenda recorrente,
  controller da fila — só em modo `server`), sincronização Price/DW.
- **`server/routes/*.cjs`** — só parsing de request/response + validação
  (`validation.cjs`, Zod). Nenhuma regra de negócio aqui.
- **`server/dominio/*.cjs`** — regra de negócio + acesso a dados, um arquivo
  por entidade (`clientes.cjs`, `agenda.cjs`, `agilTarefas.cjs`, etc.).
  `repo.cjs` é o repositório genérico (`repoPlanilha()`) usado por cima do
  `dbSqlite.cjs` — é aqui que `proibirEscritaEmModoCliente` mora de fato.
- **`server/fila/`** — sincronização multi-máquina, ver seção 1.
- **`server/ia/`** — subsistema monitorIA (agente de análise + chat
  agêntico). Ver `monitor-ia` skill pra referência completa (41 ferramentas,
  provedores Ollama/Claude CLI, alertas, memória, custo). Resumo: dois
  provedores por trás da mesma interface (`provider.cjs`); ferramentas em
  `tools.cjs` compartilhadas pelos dois; no provedor Claude CLI, o próprio
  CLI roda como subprocesso e fala com o backend via um servidor MCP local
  (`ia/claudeCli/mcpServidor.cjs`).
- **`server/dw/`** — sincronização somente-leitura com o banco de produção de
  OUTRO sistema (`DW_PLATAFORMA`, Postgres) pra enriquecer Segmento/Linha e
  credenciais do Price dos clientes que a Carteira já tem vinculados
  (`sincronizarPrice.cjs`). Nunca escreve no DW.
- **`server/alvos/`** — módulo de "Dados Alvos" (metas/acompanhamento por
  cliente, lido de CSVs externos — ver `PainelCadastroAlvos` no front).
- **`server/scripts/`** — scripts de manutenção/migração rodados manualmente
  (`publicarRelease.cjs` é o mais usado — ver seção 5).

## 3. Frontend (`src/`)

Herdou base de design e estrutura do Projeto Prisma (outro projeto interno);
paleta adaptada pra preto e branco (identidade 2D Consultores).

- **`src/context/CarteiraContext.tsx`** — único contexto global. Busca
  clientes/agenda/lembretes/categorias/ações/modelos/cadências uma vez no
  mount, expõe CRUD tipado + helpers, e o filtro global de monitor
  (`filtroMonitor`).
- **`src/api/client.ts`** — único ponto que fala HTTP com o backend. Base da
  URL condicional a `import.meta.env.DEV` (dev: URL absoluta com porta; prod:
  caminho relativo, resolvido pelo proxy do Apache).
- **`src/pages/`** — uma por rota do `react-router-dom` (ver `src/App.tsx`):
  Dashboard, Clientes, ClienteDetail, Agenda, Ações (Acompanhamento+Ações),
  Contatos, Relatórios (`CarteiraDashboardPage`), Configurações, Ágil,
  Assistente IA (chat do monitorIA).
- **`src/hooks/`** — lógica derivada por página, separada da UI
  (`useDashboardData.ts` é o maior: toda a camada de cálculo da Visão Geral).
- **`src/utils/`** — funções puras, boa parte com `.test.ts` ao lado. Núcleo
  de negócio mora em `cadenciaServico.ts` (reexporta o motor compartilhado —
  ver seção 4).
- **`src/components/`** — agrupado por domínio: `agenda/`, `agil/`,
  `dashboard/` (16 cards da Visão Geral), `cliente/`, `config/`, `eventForm/`,
  `ia/`, `acoes/`, `alvos/`, e componentes soltos de uso geral no topo
  (`Sidebar`, `GlobalSearch`, `EventFormModal`, `ClientFormModal`, etc.).

## 4. `shared/` — motor de cadência compartilhado

`shared/cadenciaServico.cjs` (+ `.d.cts` de tipos) é consumido tanto pelo
backend (`require` direto) quanto pelo frontend (pacote local
`carteira-shared`, `file:./shared` no `package.json`, importado como
`carteira-shared/cadenciaServico.cjs`). Contém: `isClienteAtivo`,
`buildFilaCadencia` (fila de priorização por serviço/cadência — usada pelo
card "Carteira no Ritmo" e pela fila de Ações), `calcularRelogio`
(status em_dia/vencendo/vencido/nunca por serviço), `buildUltimaInteracaoMap`.
Unificado em 04/09/2026 — antes era lógica duplicada nos dois lados,
sincronizada só por disciplina manual (fonte de bugs de divergência; ver
`CLAUDE.md` pra um exemplo real recente disso acontecendo de novo em cards
que reimplementavam a mesma coisa por fora do motor).

**Regra prática**: qualquer cálculo sobre "cliente está em dia com um
serviço" deve reusar este motor (`buildFilaCadencia`/`calcularRelogio`), não
reimplementar um filtro paralelo — é exatamente esse tipo de duplicação que já
causou dois cards do dashboard discordarem entre si sobre o mesmo cliente.

## 5. Deploy e distribuição

```
LAN → Apache (XAMPP) :8080  →  /              = dist/ (build estático do Vite)
                                /api, /uploads = proxy reverso → 127.0.0.1:3011 (Node)
```

- Roda na máquina **Karol-2D**, único ponto exposto na LAN é o Apache; o Node
  escuta só em loopback.
- O backend sobe junto do **launcher** (`2D_Carteira.exe`, `launcher/`),
  registrado em autostart do Windows — não mais via Tarefa Agendada (ver
  `CLAUDE.md` pro histórico do porquê).
- **Publicar uma versão**: subir `version` no `package.json`, escrever a
  seção correspondente em `NOVIDADES.md`, rodar
  `node server/scripts/publicarRelease.cjs` (builda o frontend, monta um
  staging só com as dependências de runtime do servidor — não o
  `node_modules` inteiro — e publica o `.zip` + `latest.json` numa pasta do
  OneDrive). Aplicar: Configurações → Sistema → "Atualizar agora", ou
  reiniciar o `.exe`.
- Mudou algo em `launcher/`? Precisa rodar `npm run build:launcher` e trocar
  o `.exe` manualmente em cada máquina — não se autoatualiza.

## 6. Módulos verticais (visão rápida)

| Módulo | Entrada | Backend | Frontend |
|---|---|---|---|
| Agenda/Cadência | `/agenda` | `server/dominio/agenda.cjs`, `agendaSeries.cjs`, `shared/cadenciaServico.cjs` | `AgendaPage`, `MonthGrid`, `WeekKanban`, `useDashboardData` |
| Ágil (Kanban) | `/agil` | `server/dominio/agil*.cjs`, `server/routes/agil*.cjs` (10 entidades: Workspace→Board→Coluna/Swimlane→Tarefa→Subtarefa/Comentário/Conexão/Histórico) | `src/pages/AgilPage.tsx`, `src/components/agil/` (21 arquivos) |
| monitorIA | `/assistente-ia` | `server/ia/` (ver skill `monitor-ia`) | `AssistenteIAPage`, `src/components/ia/` |
| Dados Alvos | Configurações/cliente | `server/alvos/` (leitura de CSVs) | `src/components/alvos/` |
| DW/Price sync | (cron, sem UI própria) | `server/dw/` | — |
| Extensão de acessos | download em Configurações | `public/extensao-2d-acessos.zip` (gerado por `scripts/gerarZipExtensao.cjs`) | `extensao-price-login/` (fonte da extensão), `ExtensaoAcessosCard.tsx` |

## 7. Onde procurar o quê (índice rápido)

- **Regra de "cliente ativo"**: `shared/cadenciaServico.cjs` →
  `isClienteAtivo` (reexportado em `src/utils/formatters.ts`).
- **Cadência/relógio de serviço**: `shared/cadenciaServico.cjs` →
  `buildFilaCadencia`/`calcularRelogio`.
- **Schema de cada tabela**: `server/config.cjs` → `HEADERS_BY_SHEET`.
- **Quais entidades sincronizam entre máquinas**: `server/fila/entidades.cjs`.
- **Rotas da API**: `server.cjs` (registro) → `server/routes/*.cjs`.
- **Ferramentas do agente de IA**: `server/ia/tools.cjs` (schema é o
  contrato — ver `server/ia/toolsSchema.test.ts`).
- **Config de ambiente/caminhos** (OneDrive root, SQLite dir, portas):
  `server/config.cjs`.
- **Decidir se esta máquina é "server" ou "client"**: `server/modo.cjs`.
- **Publicar release**: `server/scripts/publicarRelease.cjs`.
