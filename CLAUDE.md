# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Visão geral

**CARTEIRA 2D** (nome interno do repositório/pastas: "Carteira Web" — não renomeado, é caminho real de produção, ver `ONEDRIVE_ROOT`/`DocumentRoot` abaixo) é a **carteira de monitoria da 2D Consultores**: controle de agendamento de reuniões com clientes, histórico de análises por cliente, anotações, status de cliente (monitoria de risco/relacionamento), lembretes de agendamentos, fila de priorização por cadência (Acompanhamento/Ações) e anexos de reunião. Frontend em **React 19 + TypeScript + Vite**, backend em **Express** com persistência em Excel (`database_dev.xlsx`) + upload de arquivos — **ambos gravados dentro de uma pasta do OneDrive**, nunca na pasta do projeto (ver seção abaixo). **Sem autenticação e sem servidor de banco/nuvem** — mas servido na **rede local (LAN)** para vários usuários da 2D via Apache (XAMPP) fazendo proxy reverso pro backend (ver "Deploy em produção" abaixo). Identidade visual **preto e branco** (logo 2D Consultores: ícone de seta ascendente).

## Comandos

```bash
npm install         # instalar dependências
npm start           # roda backend (server.cjs, porta 3011) + Vite dev server (porta 5173) via concurrently
npm run dev         # só o Vite dev server
node server.cjs     # só o backend Express (falha ao subir se a pasta do OneDrive não existir — ver abaixo)
npm run build       # tsc -b && vite build — falha se houver erro de tipo
npm run lint        # ESLint (TS) sobre todo o projeto
npm run preview     # preview do build de produção
npm test            # vitest (testes do backend .cjs, ~234 casos)
npm run build:launcher  # regera launcher/dist/2D_Carteira.exe (só quando mexer em launcher/)
```

Gates automáticos: `npm run build` (roda `tsc -b` antes do Vite) e `npm test`. Rode os dois depois de qualquer mudança de tipo/estrutura. **Atenção**: os testes de `server/fila/` falham de forma intermitente (~1 em cada 3 execuções, 2 casos, some ao reexecutar) — é flakiness pré-existente de cache de módulo/pasta temporária, não regressão sua; confirme reexecutando antes de investigar.

## Onde os dados ficam salvos (regra de projeto, não só documentação)

**Todo dado do app — a planilha `database.xlsx` e a pasta `uploads/` de anexos — mora dentro do OneDrive do usuário, nunca dentro da pasta do projeto.** Isso é intencional e explícito, pedido pelo usuário: o backup/sincronização dos dados fica por conta do OneDrive, sem depender de servidor de banco de dados nenhum (nem local, nem hospedado).

- Caminho hoje, em `server/config.cjs` (constantes `ONEDRIVE_ROOT` / `DATA_DIR`), sobrescrevível por `ONEDRIVE_ROOT` no `.env` (não versionado) por máquina:
  `C:\Users\Kerol\OneDrive - 2dconsultores.com.br\01 - Marco + Monitores\6 - Erick\Carteira Web\`
  - **Não é mais `Monitor1-2D`/`Monitor-2D`** — essa máquina foi substituída por **Karol-2D** (usuário `Kerol`) como ambiente de produção atual. Se você ver `Monitor1-2D` em algum lugar (ex.: `iniciar-servidor.vbs`), é só o *default histórico* do script — na prática o `.env` da máquina manda.
  - **Arquivo real usado hoje é `database_dev.xlsx`, não `database.xlsx`** (constante `DB_FILE` em `server/config.cjs`) — nome "dev" ficou do período de migração de schema, mas é o banco em uso de fato em produção agora. O `database.xlsx` antigo (pasta `6 - Erick`, um nível acima) é o banco legado pré-migração; não é mais escrito.
  - A pasta `uploads/` fica dentro de `Carteira Web/`, junto do `database_dev.xlsx`.
- **Não existe fallback para pasta local.** Se `ONEDRIVE_ROOT` não existir nesta máquina (OneDrive não sincronizado, pasta renomeada, rodando em outra máquina/usuário), `server.cjs` **falha ao iniciar** (`process.exit(1)` com mensagem clara) em vez de silenciosamente criar os dados em outro lugar. Não "conserte" esse erro adicionando um caminho alternativo — se o caminho mudar de verdade, atualize o `.env` da máquina (ou o default em `server/config.cjs`) e avise o usuário, não invente um fallback.
- Já passamos por várias arquiteturas antes de chegar aqui: Excel local na pasta do projeto → PostgreSQL local (instalado via winget) → PostgreSQL hospedado no Render → **Excel dentro do OneDrive (atual)**. O PostgreSQL 17 local (serviço `postgresql-x64-17`) **não é mais usado** e já foi **parado + desativado** (StartType=Disabled) — estava exposto na LAN em `0.0.0.0:5432` sem função, era só superfície de ataque. Continua **instalado** (dados no disco em `C:\Program Files\PostgreSQL\17\data`); reativar é só religar o serviço. Confirme com o usuário antes de **desinstalar** (aí sim os dados somem).

## Deploy em produção (Apache/XAMPP na máquina da 2D)

O app roda na máquina **`Karol-2D`** (usuário `Kerol`) — substituiu a antiga `Monitor1-2D`/`Monitor-2D`. Acessado pelos usuários da LAN em **`http://carteira.local:8080/`** (porta **8080**, não a 80 — reservada pro site padrão do XAMPP nessa máquina, ex.: outro projeto interno como o Prisma). Arquitetura:

```
LAN → Apache (XAMPP) :8080  →  /            = arquivos estáticos do build (C:/projects/Carteira Web/dist)
                                /api, /uploads = proxy reverso → Node 127.0.0.1:3011
```

- **Apache é o único ponto exposto na rede.** O Node só escuta em loopback (`127.0.0.1:3011`) — inacessível direto pela LAN. Config em `C:\xampp\apache\conf\extra\httpd-vhosts.conf` (vhost dedicado, porta 8080, `ServerName carteira.local`): `DocumentRoot` = `C:/projects/Carteira Web/dist`, `RewriteRule` de fallback pro `index.html` (SPA do React Router, exceto `/api/` e `/uploads/`), e `ProxyPass`/`ProxyPassReverse` de `/api` e `/uploads` pra `127.0.0.1:3011`.
- **Quem sobe o backend hoje: o `.exe` (launcher), não mais a Tarefa Agendada.** A tarefa `CarteiraWeb-Backend` está **desativada** (`Disable-ScheduledTask`) desde 25/08/2026 — ela e o `.exe` disputavam a mesma porta e o vencedor era quem bootasse primeiro, o que deixava a UI achando que não havia `.exe` nenhum (sem botão de atualizar, sem "iniciar com o Windows"). O `iniciar-servidor.vbs` continua no repositório só como caminho alternativo; se for reativá-lo, **desative o autostart do `.exe` antes**.
  - **Apache**: serviço do Windows (`Apache2.4`, StartType=Automatic) — sobe no boot. Reiniciar exige elevação (`Restart-Service Apache2.4` como admin); sem isso ele segue com o vhost antigo em memória.
  - **Node**: sobe junto com o `2D_Carteira.exe` (Desktop do `Kerol`), registrado em `HKCU\...\Run` pelo próprio app (Configurações → Sistema → "Iniciar com o Windows"). O launcher atualiza `C:\SistemaCarteira\app` pela release do OneDrive antes de subir o servidor.
  - A chave `Run` guarda o **caminho absoluto** do `.exe`, então renomear/mover o binário quebrava o autostart em silêncio — e a tela ainda dizia "ativado", porque só checava se o valor existia. Corrigido em `server/routes/sistemaLocal.cjs`: `estaAtivo()` agora exige que o arquivo exista, e `corrigirAutostartQuebrado()` (chamada no boot por `inicio.cjs`) reescreve a chave com o caminho do `.exe` atual quando o registrado não existe mais. Fica do lado do `server/`, não do `launcher/`, de propósito: assim a correção chega pela release (que se atualiza sozinha) inclusive em quem ainda tem o binário antigo. Nunca ATIVA autostart pra quem não tinha — só corrige o que já estava ligado.
- **Depende de login**: Apache sobe sem login, mas o Node (os dados) só sobe após o **logon do usuário da máquina** (`Kerol`) — é de onde vem o acesso ao OneDrive. A máquina precisa ficar logada nesse usuário. Inerente ao desenho de dados no OneDrive.
- **Porta do backend é 3011, não 3001** (`server/config.cjs`, `launcher/config.cjs` — os dois precisam bater). A 3001 é disputada por outro projeto da mesma máquina (`medstone-main`, que ainda escuta em `0.0.0.0:3001`); enquanto ele estiver de pé, voltar pra 3001 é jogo de sorte.
- **Publicar uma versão nova** (é isso que chega nos usuários, inclusive nesta máquina): subir `version` no `package.json` e rodar `node server/scripts/publicarRelease.cjs` (com `NODE_PORTATIL_PATH` apontando pro `node.exe` portátil, ex.: `C:\SistemaCarteira\app\node\node.exe`). Isso já roda `npm run build`, então o `dist/` que o Apache serve fica alinhado com a release na mesma tacada. Aplicar: Configurações → Sistema → "Atualizar agora" (fecha o servidor e reabre o `.exe`), ou simplesmente fechar e abrir o `.exe`.
- **Mudou algo em `launcher/`?** Aí não basta publicar release — o `.exe` não se atualiza sozinho. Rodar `npm run build:launcher` e **substituir o `.exe` à mão** em cada máquina. O binário chama-se **`2D_Carteira.exe`** (era `CarteiraLauncher.exe`); a única referência remanescente ao nome antigo é `launcher/config.cjs` (pasta de estado `AppData\Local\CarteiraLauncher`), mantida de propósito — renomear faria as instalações existentes perderem a pasta de instalação registrada.
  - **Ícone do `.exe`**: resolvido em `launcher/aplicarIcone.cjs`, e a receita é contraintuitiva por dois motivos que já custaram build "verde" com ícone errado. (1) O ícone NÃO pode ir no `.exe` pronto: o `pkg` anexa o payload depois do fim da imagem PE, e reescrever recursos regenera o PE, muda o tamanho e descarta o payload — o binário morre com "Pkg: Error reading from file." (foi o que aconteceu com `rcedit`). (2) Também não pode ir no base dentro de `~/.pkg-cache`: o `pkg-fetch` confere o SHA e rebaixa o arquivo ("Binary hash does NOT match. Re-fetching..."), desfazendo tudo em silêncio. A saída é copiar o base pra fora do cache, aplicar o ícone na cópia (via `resedit`, devDependency pura em JS) e apontar `PKG_NODE_PATH` pra ela — essa env faz o `pkg` usar o caminho indicado E pular a checagem de hash. O build valida contando as RESOLUÇÕES do grupo de ícone (o base do Node também tem grupo; contar "tem ícone?" não distingue).
  - **`marcarComoGui.cjs` é o caso oposto**: troca 2 bytes no lugar, sem mudar tamanho, então roda no `.exe` pronto sem risco pro payload.
- **Sem autenticação, servido na LAN**: qualquer um na rede acessa e edita tudo, sem senha (decisão do usuário, uso interno). Se o roteador encaminhar a porta 8080 pra internet, o sistema inteiro fica exposto pra fora — verificar no roteador antes de assumir que é só interno.

## Arquitetura

### Backend (`server.cjs`)

API Express minimalista, CommonJS (`.cjs`), sem build step, roda direto com `node server.cjs`:

- Escuta estritamente em `127.0.0.1:3011` — nunca `0.0.0.0`. O default de `HOST` em `server.cjs` é `127.0.0.1` (loopback): em produção o Apache faz proxy reverso pro backend na própria máquina, então o Node **nunca** fica exposto direto na rede. A env `APP_HOST` ainda permite bindar num IP de LAN pra rodar `npm start` (dev) acessível por outras máquinas sem Apache. CORS restrito à origem do Vite dev server (`localhost:5173` / `127.0.0.1:5173`) — em produção o CORS nem é acionado (mesma origem via proxy).
- **Persistência**: `database_dev.xlsx` dentro do OneDrive (ver seção acima), lido/escrito via `xlsx` (SheetJS) — sem banco real, sem ORM. Cada entidade é uma sheet, headers fixos em `HEADERS_BY_SHEET` (`server/config.cjs`): `Clientes`, `Agenda`, `Lembretes`, `Categorias`, `Acoes`, `Modelos`, `Cadencias`. `getSheetData`/`saveSheetData` fazem leitura/escrita **completa** do arquivo a cada chamada — sem transação/locking, chamadas concorrentes podem se sobrescrever. Isso também significa: se o OneDrive estiver sincronizando o arquivo no momento de uma escrita, pode haver conflito — não é um caso tratado hoje.
- **Campos aninhados (arrays/objetos) não sobrevivem ao `json_to_sheet` do SheetJS** — por isso campos como `contatos`/`servicos` (Cliente), `servicos`/`monitores`/`checklist`/`attachments` (EventoAgenda) são serializados para JSON string no frontend (`src/api/client.ts`, funções `serialize*`/`deserialize*`) antes de enviar, e desserializados na leitura. Se adicionar um novo campo estruturado (não string/number/boolean), siga o mesmo padrão e inclua a coluna em `HEADERS_BY_SHEET` — senão vira `"[object Object]"` na célula, ou (se faltar em `HEADERS_BY_SHEET`) é apagado de todas as linhas no próximo save da aba inteira.
- **`Categorias`** guarda todos os valores configuráveis por tipo (`servico`, `tipo_evento`, `status_cliente`, `status_evento`, `monitor`, `tipo_lembrete`, `sala`) — status de cliente/evento **não são enums fixos no código**, são dados editáveis em Configurações (`opcoesPorTipo` no `CarteiraContext`). Ao adicionar um valor novo em produção (ex.: um status novo), lembre que o *seed* (`CATEGORIAS_SEED`) só roda na criação da planilha — bases já existentes precisam do valor inserido via API/UI também, não só no seed.
- **Anexos**: upload local via `multer` (`POST /api/uploads`, campo `file`), arquivos gravados em `uploads/` dentro da pasta do OneDrive, nome `${crypto.randomUUID()}-${originalname}`, servidos estaticamente em `/uploads/:filename`. `DELETE /api/uploads/:filename` usa `path.basename()` no parâmetro para evitar path traversal. Deletar um cliente/evento **não** apaga os arquivos físicos associados — limpeza manual hoje, não automática.
- `initDB()` cria o workbook com headers fixos na primeira execução. **Precisa terminar com `xlsx.writeFile`** no ramo "arquivo não existe" — já houve um bug real aqui em que esse `writeFile` faltava e a API quebrava com ENOENT no primeiro boot.
- IDs são gerados no frontend (`uuid`) e enviados no corpo da requisição — o servidor não gera IDs.
- Deletar um cliente (`DELETE /api/clients/:id`) faz cascade delete manual dos itens de agenda vinculados (`clientId`) — não existe FK/constraint de banco aqui (é Excel), a integridade é toda responsabilidade do código em `server.cjs`.

### IA (`server/ia/`) — dois provedores, mesma interface

O monitorIA (análise automática de risco + chat agêntico com ferramentas que leem e escrevem dado de verdade) atende por **um de dois provedores**, escolhido em `server/ia/provider.cjs`:

- **`ollama`** (default) — HTTP direto no Ollama local ou no Ollama Cloud (`server/ia/ollamaClient.cjs`). Quem roda o loop de tool-calling é o `orquestrador.cjs` daqui.
- **`claude-cli`** — dirige o **Claude Code CLI instalado na máquina como subprocesso** (`server/ia/claudeCli/`). **Não é a API da Anthropic**: não existe `ANTHROPIC_API_KEY` em lugar nenhum desse caminho — `estado.ambienteCredencial()` até apaga `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` do ambiente do filho de propósito, porque elas teriam precedência sobre o token OAuth e passariam a cobrar por API paga sem ninguém perceber. A credencial é o login da conta Claude (assinatura Pro/Max/Team).

Escolha: `IA_PROVIDER` no `.env`, quando setado, **manda e trava** a troca pela interface; sem ele vale o que a GUI gravou em `SQLITE_DIR/claude-cli.json`.

**Duas credenciais são aceitas** (`server/ia/claudeCli/auth.cjs`), nesta ordem:

1. Token OAuth de 1 ano que a GUI guardou em `SQLITE_DIR/claude-cli.json` (LOCALAPPDATA, **nunca no OneDrive** — é credencial de conta pessoal; sincronizar publicaria pra todo mundo com acesso à pasta corporativa), passado por `CLAUDE_CODE_OAUTH_TOKEN`.
2. **O login do próprio CLI nesta máquina** (`~/.claude/.credentials.json`, feito por `claude auth login`, `/login` ou a extensão do VS Code), detectado por `claude auth status` — que devolve JSON e funciona com stdio comum. Numa máquina onde o usuário já usa o Claude Code (o caso da máquina de produção), **o provedor funciona sem ninguém logar de novo**. Exigir só o (1) era um bug: recusava trabalhar com credencial válida na mão.

**Login pela GUI (Configurações → Sistema → monitorIA):** o backend roda **`claude auth login --claudeai`** como subprocesso, captura do stdout o **link de autorização** e mostra na tela; o usuário aprova no navegador, cola o **código** que o navegador devolve, o backend escreve no stdin do CLI. Detalhes que não são acidentais:

- **O comando é `auth login`, não `setup-token`, e isso foi medido, não presumido.** O `setup-token` (o comando "de CI", que imprimiria o token) **não escreve nada com stdio comum** — exige terminal de verdade: testado na máquina de produção com a versão 2.1.247, ficou 60s em silêncio e estourou o timeout. O `auth login`, com os MESMOS pipes, imprime o link e o prompt `Paste code here if prompted >`. Se alguma versão futura mudar isso, o sintoma é o estado `erro` com "não imprimiu o link".
- `node-pty` é usado se estiver instalado, mas **não é mais necessário**; segue opcional (módulo nativo, o `pkg` do launcher não empacota nativo) só como rede de segurança.
- `auth login` **não imprime token**: ele guarda a credencial sozinho. Então o fim do fluxo não é "achei o token na saída" — é comparar `auth status` antes/depois. Comparar (e não só checar) importa: numa máquina já logada, uma tentativa que falha reportaria sucesso.
- **Desconectar apaga só o token da GUI**, nunca roda `claude auth logout`: aquele login é da máquina e é usado pelo usuário fora daqui (terminal, VS Code). A tela explica isso em vez de oferecer um botão com efeito colateral em ferramenta de terceiro.
- O CLI pode abrir o navegador **na máquina do servidor**. Usando a GUI de outra máquina da LAN, essa aba abre no lugar errado e é inofensiva — vale o link mostrado na tela.

**Ferramentas via MCP, não via prompt.** No provedor `claude-cli`, quem roda o loop de ferramentas é o próprio CLI: `server/ia/claudeCli/mcpServidor.cjs` é um servidor MCP (stdio, JSON-RPC por linha, escrito à mão — o projeto não tem dependência de IA) que o CLI sobe como filho, apontado por `--mcp-config`. Esse processo **não abre o SQLite**: é só um proxy HTTP pra `/api/ia/interno/*` no backend (loopback + segredo por processo, gerado em `cliente.cjs`). Consequências que valem lembrar antes de mexer:

- Um único escritor no banco continua sendo o backend, e o log `AcoesIA` continua sendo gravado num único lugar (`orquestrador.registrarAcao`), igual nos dois provedores.
- `MAX_ITERACOES_FERRAMENTA` **não se aplica** aqui (o loop é do CLI) — o limite é `CLAUDE_CLI_TIMEOUT_MS`.
- Todas as ferramentas nativas do CLI são **negadas** (`--disallowed-tools`) e só `mcp__carteira` é liberada. Liberar `Bash` num processo que roda como o usuário dono do OneDrive corporativo, num app **sem autenticação** exposto na LAN, seria dar shell a quem digitar no chat.
- O `cwd` do CLI é uma pasta vazia dedicada (`CLAUDE_CLI_CWD`), não o repositório — senão ele carregaria este `CLAUDE.md` e as regras do projeto no próprio system prompt do agente de monitoria.
- O system prompt vai por `--append-system-prompt`, que **soma** ao prompt de agente de código do CLI (não dá pra remover). É o custo inerente de usar o CLI em vez da API.
- Instalação por npm entrega um shim `claude.cmd`, e o Node recusa `spawn` de `.cmd` sem `shell: true` (`EINVAL`); nesse modo o Node **não escapa** argumentos. `server/ia/claudeCli/spawnCli.cjs` decide o modo, e no caminho com shell o system prompt vai pelo STDIN em vez de por argumento — ele tem aspas e `%`, que viravam sintaxe de `cmd.exe`.
- Este provedor **não funciona com o backend empacotado (`pkg`)**: o servidor MCP precisa de um `node.exe` real. Hoje isso não é problema — o launcher sobe o backend com Node portátil, não empacotado —, e a GUI avisa se algum dia for.

**Verificado ponta a ponta em 27/08/2026** na máquina de produção (CLI 2.1.247): pergunta no chat → CLI dirigido pelo backend → servidor MCP → ferramenta executada no SQLite → `AcoesIA` gravado → resposta em ~8s. Se for testar de novo com um `SQLITE_DIR` temporário, **não suba o `server.cjs`**: o boot dele roda `rodarBackupSqlite()` e sobrescreve o espelho `database_dev.xlsx` do OneDrive com o dado de teste (aconteceu; o mirror não é lido pelo app e foi refeito com `exportarXlsx()`, mas evite o susto).

### Frontend (`src/`)

Base de design e estrutura herdada do **Projeto Prisma** (outro projeto interno): mesmo padrão de `glass-card`/`stat-card-*`/`custom-select`/modal, e mesma separação `api/` + `types/` + `hooks/` + `pages/` + `components/` + `context/`. A paleta foi adaptada para **preto e branco** (identidade 2D Consultores) — `--accent` é branco (não indigo), só os badges de status semântico (sucesso/atenção/perigo) mantêm cor.

- **Navegação**: sidebar lateral fixa (`src/components/Sidebar.tsx`, não navbar superior) com logo + nav + ações rápidas (Buscar Ctrl+K, Novo Evento, Novo Lembrete). Roteamento via `react-router-dom` (`src/App.tsx`): `/` (Dashboard), `/clientes`, `/clientes/:id` (detalhe do cliente), `/agenda`, `/acoes` (Acompanhamento + Ações), `/contatos`, `/relatorios`, `/config` (Configurações). Sem autenticação/rota protegida — fora de escopo.
- **Estado global**: `CarteiraContext` (`src/context/CarteiraContext.tsx`) busca clientes/agenda/lembretes/categorias/ações/modelos/cadências uma vez no mount e expõe CRUD tipado + helpers (`enviarAnexoEvento`, `removerAnexoEvento`, `criarLembrete`, `registrarAcao`, `salvarCadencias`, `criarCategoria`/`atualizarCategoria`/`removerCategoria`, `opcoesPorTipo`); todas as páginas leem daqui via `useCarteira()`. `src/api/client.ts` é o único lugar que fala com a API. A base da API é **condicional ao modo** (`import.meta.env.DEV`): em **dev** usa URL absoluta (`http://<hostname>:3011/api`, portas separadas); em **produção** usa **caminho relativo** (`/api`, `/uploads`) — o Apache resolve via proxy, então nenhum IP/porta fica hardcoded no build. Não volte a hardcodar host/porta aqui.
- **Cliente** (`Cliente` em `src/types/index.ts`): dois campos de situação, **não um só**:
  - `estado?: 'Ativo' | 'Inativo'` — liga/desliga o cliente das contas de cadência/Ações/Dashboard (`isClienteAtivo` em `src/utils/formatters.ts`).
  - `status: string` — situação mais granular, valores em `CLIENTE_STATUS_OPCOES` (`Regular | Suspenso | Atendido pelo Marco | Gratuidade | Problemas Externos`).
  - `isClienteAtivo` exige os **dois**: `estado === 'Ativo'` **e** `status` sendo um dos "em atendimento" (`Regular`/`Gratuidade`/vazio/legado `Ativo`) — só `estado` sem checar `status` foi um bug real (cliente "Atendido pelo Marco" com `estado=Ativo` contava como ativo normal em tudo). Sem `estado` preenchido (dado legado), cai no fallback antigo (`status` começando com `ativ`/`gratuidade`).
  - `observacao: string` é texto livre — não existe mais lista de notas timestampadas (`Nota[]`).
- **Evento de Agenda** (`EventoAgenda`): tem `subject` (assunto da reunião, obrigatório) além de `description`, `attachments: Anexo[]`, e `monitores: string[]` (**múltipla escolha** desde que a reunião passou a poder ter mais de um monitor — antes era `monitor?: string` único; conflito de horário considera qualquer monitor em comum entre dois eventos). `status` (`EventoStatus = string`) é igual ao de Cliente: valores livres, configuráveis via categoria `status_evento` (inclui `Pendente`, adicionado depois do seed original — qualquer status novo funciona sem mudança de código, contanto que não colida com os regexes de classificação: `/conclu|realiz/i` = concluído, `/cancel|reagend/i` = cancelado). **Upload de anexo só é permitido em modo de edição** (evento já existe) — `EventFormModal` esconde a seção de anexos ao criar um evento novo, mostrando "salve o evento primeiro". Isso é intencional (upload precisa de um id para associar), não um bug.
- **Fila de priorização por cadência** (`buildFilaCadencia` em `src/utils/cadenciaServico.ts`, usada em `/acoes` e nas sugestões de agenda): ordena por (1) severidade (vencido/nunca > vencendo > em dia), (2) **quantidade de serviços ruins** — cliente atrasado em 2 serviços sempre vem antes de atrasado em 1, mesmo com atraso "pior" no de 1 só —, (3) contato recente não refletido na cadência (empurra pro fim do próprio bloco), (4) atraso em dias. "Nunca atendido" conta o atraso em **dias reais desde que o cliente entrou na carteira** (`createdAt`), não mais um peso fixo artificial — esse peso fixo fazia um cliente com 1 serviço em dia + 1 nunca atendido pular pra frente de quem estava vencido há 100+ dias nos dois serviços, só pela distorção de escala.
- **Filtro GLOBAL de monitor** (`CarteiraContext.filtroMonitor`/`setFiltroMonitor`/`monitoresDisponiveis`, controle no header em `App.tsx`, ao lado do `ThemeToggle`) — "quem sou eu nesta máquina". Existe porque o app não tem autenticação (LAN, qualquer um usa o mesmo navegador) e mesmo assim cada monitor só deveria ver o que é dele: seus clientes na Visão Geral, seus alertas no monitorIA. Fica no Context, e não como `usePersistedState` duplicado em cada página — duas instâncias de `usePersistedState` com a mesma key não se sincronizam entre si (cada uma é um `useState` independente que só lê o localStorage na montagem), então mudar numa tela não atualizaria outra já montada. Só aparece no header quando há 2+ monitores com cliente ativo (com um só, o filtro não decide nada). A Visão Geral usava um dropdown próprio antes — foi removido de lá pra não duplicar controle pra mesma variável.

- **Navegação entre páginas com contexto** (busca global levando para uma data na Agenda, botões "Novo Evento"/"Novo Lembrete" pré-preenchendo o cliente) usa `navigate(path, { state: {...} })` + `useLocation().state`. Atenção: o `useEffect` que lê esse `state` em `AgendaPage` precisa depender de `location.key` (não de `[]`) — senão navegações repetidas para a mesma rota já montada não disparam o efeito. Já foi um bug real aqui.
- **Ícones/logo**: `public/favicon.svg` é a fonte única da arte (derivada de `src/assets/logo-2d.svg`); `scripts/gerarIconesPwa.cjs` rasteriza dela o `icon-192/512.png` (PWA) e o `launcher/icone.ico` (bandeja + ícone do `.exe`). Rodar o script depois de qualquer ajuste no SVG. Como os NOMES dos arquivos são fixos e navegador/SO cacheiam favicon e ícone de PWA instalado de forma agressiva, as referências carregam `?v=N` (`index.html`, `public/manifest.webmanifest`, `Sidebar.tsx`) — **subir esse número junto com a troca de arte**, nos três lugares, senão quem já usa continua vendo a logo antiga.

- **Cuidado com datas `type="date"`**: um `<input type="date">` produz uma string tipo `"2026-07-16"`; `new Date("2026-07-16")` é interpretada como **UTC meia-noite** pelo motor JS, o que desloca um dia para trás em fusos negativos (ex.: Brasil) quando reformatada em hora local — já foi um bug real em `EventFormModal`. Use `parse(dateStr, 'yyyy-MM-dd', new Date())` do `date-fns` (parse em hora local) antes de `.toISOString()`, nunca o construtor `new Date(string)` direto para strings de data pura.
- **Feriados brasileiros** (`src/utils/holidays.ts`): nacionais fixos + móveis (Páscoa via algoritmo Gregoriano), estaduais RJ e municipais Duque de Caxias. `previousBusinessDay()` implementa o "cálculo de dia útil retroativo" — usado por `ReminderPopup` para antecipar notificações que caem em fim de semana/feriado.
- **Lembretes recorrentes** (`src/components/ReminderPopup.tsx`): polling a cada 20s, dispara toast in-app (**sem** `Notification` API nativa — removida de propósito: app servido em HTTP puro na LAN, não é "contexto seguro", o Chrome nega essa API em silêncio nesse caso), auto-dismiss em 45s ou fechamento manual, recalcula a próxima ocorrência (`daily`/`weekly`/`monthly`) ou marca `concluido` se não houver recorrência. `Lembrete.eventId` (opcional) permite ligar um lembrete a uma reunião específica.

### Ferramentas do agente (`server/ia/tools.cjs`) — o schema É o contrato

O que o modelo pode fazer é exatamente o que o `parameters` de cada ferramenta declara. Duas falhas silenciosas moram aí, e as duas já aconteceram:

- **Filtro que falta**: `buscar_clientes` não tinha filtro por NOME (só por `grupo`/rede). Pedir "o cliente 27 de setembro" fazia o agente usar `grupo` — o único campo parecido —, receber zero e responder que o cliente não existia. O cliente existia. Hoje existe `nome` (busca parcial, normalizada sem acento/maiúscula, contra `empresa`).
- **Filtro declarado que a função ignora**: pior, porque nada quebra — o modelo manda o filtro, a ferramenta devolve a lista inteira e o agente afirma com confiança um resultado que ninguém filtrou.

`server/ia/toolsSchema.test.ts` fecha as duas: para cada ferramenta, todo parâmetro declarado tem de ser lido **e** usado no corpo, todo parâmetro lido tem de estar declarado, `required` tem de existir em `properties`, e ferramenta que exige `clientId` tem de falhar explicitamente sem ele. Ao adicionar ferramenta ou parâmetro, é esse teste que avisa se as duas pontas saíram de sincronia.

### Resposta do agente na tela é markdown

Os modelos devolvem `**negrito**`, bullets e títulos. O chat imprimia `{m.content}` cru e o usuário via linhas de asterisco. `src/components/ia/RespostaIA.tsx` (+ `blocosMarkdown.ts`, testado) renderiza o subconjunto que os modelos realmente emitem, montando **elementos React** — nunca `dangerouslySetInnerHTML`: o texto vem de um LLM, então nada aqui pode virar HTML. A fala do usuário segue texto puro de propósito.

### Consumo de IA (`server/ia/uso.cjs`) — não é a cota da assinatura

`GET /api/ia/uso` (painel em Configurações → Sistema, `UsoIACard`) mostra tokens/custo **por pergunta**, nos dois provedores, com drill-down até as ferramentas chamadas naquele turno (entrada/saída de cada uma).

**Correção de uma conclusão errada**: o CLI não mostra a janela de 5h/limite de 7 dias, e por um bom tempo isso pareceu significar que a informação não existia sem sessão de navegador. Não é isso — inspecionar `~/.claude/debug/<session>.txt` só provou que o CLI **descarta** o dado depois de decidir fast-mode; ele não aparece no log porque o CLI não loga headers de resposta, não porque a API não os manda. Batendo DIRETO em `POST https://api.anthropic.com/v1/messages` com a mesma credencial OAuth do CLI (`~/.claude/.credentials.json` ou o token salvo pela GUI), a resposta carrega nos HEADERS: `anthropic-ratelimit-unified-5h-utilization`, `-status`, `-reset`, e o equivalente pra `7d` (`anthropic-ratelimit-unified-7d-*`). É esse dado que `server/ia/claudeCli/limiteConta.cjs` lê — card `LimiteContaCard` em Configurações → Sistema, com barra de progresso e horário de reset.

Detalhe que importa: é uma chamada **real e paga** (Haiku, `max_tokens: 1`, ínfima mas não grátis) — não existe endpoint "grátis" que devolva só os headers sem gerar uma resposta (`count_tokens` não carrega rate-limit). Por isso tem cache de 5 min no backend e fica registrada no próprio painel de consumo (`origem: 'sonda-cota'`), pra não virar tráfego invisível nem parecer pergunta do usuário. Requer `anthropic-beta: oauth-2025-04-20` no header — sem ele a API rejeita o bearer OAuth do CLI.

**O que É real e fica no painel**: cada resposta gera uma linha em `UsoIA` com tokens de entrada/saída/cache e custo em USD (Claude CLI: soma o `modelUsage` do resultado do CLI, não o `usage` de topo — esse reflete só a ÚLTIMA iteração do turno, visto na prática: uma chamada simples trouxe `usage.input_tokens: 2` enquanto `modelUsage` tinha os ~54 mil tokens de criação de cache da primeira iteração; Ollama: `prompt_eval_count`/`eval_count` da resposta, custo sempre 0 — é local/gratuito).

**Correlação pergunta↔ferramenta**: toda chamada de ferramenta (`AcoesIA`) carrega o mesmo `turnId` da pergunta que a disparou (`UsoIA`). No provedor Ollama isso é trivial (mesmo processo, mesmo loop). No Claude CLI é mais sutil: quem chama a ferramenta é o servidor MCP, um PROCESSO FILHO do CLI — o `turnId` viaja como variável de ambiente (`CARTEIRA_IA_TURNO`) no `--mcp-config` que `cliente.cjs` gera a cada `conversar()`, o mesmo mecanismo que já levava `CARTEIRA_IA_ORIGEM`.

### Alertas de profundidade — não só atraso/vencimento

Além dos quatro alertas de cadência, `server/ia/alertas.cjs` tem dois que leem o **texto** do dossiê (`### Pontos de Atenção`), não só data:

- **Contradição dossiê × risco**: 2+ sinais negativos (cancelamento, não comparecimento, sem retorno — vocabulário observado nos dossiês reais) registrados, mas a classificação de risco continua "baixo". Ninguém enxerga isso olhando cliente por cliente, porque o dossiê é lido em prosa — ninguém CONTA quantos sinais se acumularam.
- **Pauta recomendada que morreu**: a última análise sugeriu uma próxima pauta e não há reunião futura marcada nem reunião com ata desde então. Mede se a recomendação da IA vira ação ou só relatório.

E `GET /api/ia/padroes` (rota separada, `gerarPadroesCarteira`) é **padrão de processo**, não de cliente: tema recorrente nos Pontos de Atenção de 5+ clientes (hoje: cancelamento e "sem ata") vira um card só, sem `clientId`. Motivo de ser rota/função separada: um card sem cliente não se encaixa no mesmo agrupamento/dedup por-cliente dos outros alertas — forçar os dois juntos acoplaria duas formas de alerta bem diferentes.

**Cuidado ao testar isto**: os dois alertas de dossiê chamam `lerDossieCliente`, que lê arquivo em `DOSSIES_DIR` — **não tem override próprio**, deriva de `ONEDRIVE_ROOT` (`DATA_DIR = ONEDRIVE_ROOT + 'Carteira Web'`, `DOSSIES_DIR = DATA_DIR + 'dossies'`). Testar sem isolar `ONEDRIVE_ROOT` (e `require` fresco dos módulos, mesmo padrão de `dbSqlite.test.ts`) escreve no dossiê REAL da máquina — aconteceu durante o desenvolvimento disto, com um id de teste que por sorte não colidia com cliente real, mas o arquivo ficou órfão na pasta de produção até ser notado e apagado manualmente.

### Dossiê (arquivo) e AnalisesIA (sheet) são DUAS fontes — mantidas em sincronia num campo

Bug de produção: `corrigir_dossie_cliente` só reescrevia o arquivo do dossiê. A ficha do cliente (`AnaliseIACard`) e o dashboard leem `AnalisesIA.sugestaoProximaPauta`/`resumo`/`nivelRisco` — um campo **separado**, gerado só pela análise automática. Usuário confirmava "a reunião já aconteceu, atualiza a pauta" pelo chat, o agente confirmava, o dossiê mudava — e a ficha do cliente continuava mostrando a pauta antiga, porque lia a outra fonte.

`corrigirDossie` (tools.cjs) agora extrai a seção "### Próxima pauta" do corpo salvo e escreve em `AnalisesIA.sugestaoProximaPauta` também (`repo.update`). `resumo`/`fatores` continuam só da análise automática, de propósito — não mapeiam 1:1 pra nenhuma seção do dossiê.

### Privacidade das conversas: identidade voluntária, não autenticação

App sem login, LAN, "ninguém deveria ver o que eu converso com o agente". Sem autenticação real, a única identidade possível é o filtro global de monitor (`CarteiraContext.filtroMonitor`, "quem sou eu nesta máquina", já existente) — o frontend manda esse valor junto de cada pergunta ao chat, o backend carimba em cada linha de `AcoesIA` (coluna `monitor`, propagada nos DOIS provedores — no Claude CLI via env var `CARTEIRA_IA_MONITOR` no `--mcp-config`, mesmo mecanismo do `turnId`), e o painel "Ações do agente" filtra pelo `filtroMonitor` atual. Com o filtro em "Todos" (ninguém escolheu identidade), mostra tudo — não dá pra impor privacidade sem identidade real, e isso precisa ficar claro pro usuário: é cortesia entre colegas, não segurança.

### Ata e anexos: já estavam expostos, o agente é que negava acesso

`buscar_historico_eventos` sempre devolveu `ata` (texto completo) — o agente respondeu "não tenho acesso a atas/documentos" quando a informação estava na própria chamada que ele fez. Reforçada a descrição da ferramenta e adicionada uma norma explícita (GATILHO ATA/ANEXO) proibindo essa negação sem antes checar. Junto, `eventos[].anexos` passou a listar os arquivos anexados (`nome` + `url` relativa), que não eram expostos.

**Deliberadamente fora de escopo por ora**: o agente **não pode gerar o PDF da ata** (o botão existente usa `jsPDF` no navegador, `src/utils/ataPdf.ts` — replicar isso no backend seria duplicar ~150 linhas de layout numa segunda fonte de verdade, sem o usuário perder a função: o botão já existe na tela do evento). Se quiser essa capacidade no agente, é decisão de escopo separada, não uma correção.

### Criar evento/lembrete: valor é validado contra o cadastro, nunca gravado cru

Bug de produção: o agente criou uma reunião com `monitores: ["Erick"]` — a opção cadastrada é "Erick Cardoso" (`Categorias`, tipo `monitor`). O valor foi gravado como veio, não casou com nenhuma opção do `<select>` na tela de edição, e o campo apareceu **vazio** pro usuário. Sem erro, sem log — pareceu que tinha dado certo.

`server/ia/tools.cjs` (`resolverOpcao`) resolve `monitores`/`servicos`/`sala` (evento) e `type` (evento e lembrete) contra `Categorias` ANTES de gravar: match exato por texto normalizado vence; senão aceita prefixo/trecho ÚNICO ("Erick" → "Erick Cardoso"); ambíguo ou inexistente é **erro com a lista de opções válidas**, que volta pro modelo corrigir — nunca escolhe por conta própria nem grava o valor cru. Ferramenta nova, `buscar_opcoes_evento`, devolve os cinco tipos de categoria usados aqui; o agente consulta sozinho quando não tem certeza do nome exato.

### Memória do agente: dois níveis, e nenhum é o outro

- **Dossiê** (`corrigir_dossie_cliente`, arquivos em `DOSSIES_DIR`) — memória **de um cliente**.
- **Memória geral** (sheet `MemoriaIA`, ferramentas `buscar`/`registrar`/`remover_memoria`) — **regras do processo** que valem pra carteira inteira ("a ata só é preenchida ao final da reunião"). Antes não existia: pedir isso ao agente não tinha onde cair, e um deles respondeu culpando permissão de escrita de arquivo (`Write`, do Claude Code) em vez de dizer que a ferramenta não existia.

As regras gerais entram **direto no system prompt** (`agente.blocoMemoria`), não só atrás da ferramenta: memória que depende de o modelo lembrar de consultar é memória que ele esquece. Como o system prompt é reenviado a cada chamada, o bloco é limitado (25 regras / 2000 chars, cortando as mais antigas) — crescer sem teto seria custo fixo subindo em toda pergunta.

### Alertas conversáveis (`server/ia/alertas.cjs`)

As análises automáticas rodavam e ninguém lia. `GET /api/ia/alertas` transforma os mesmos gatilhos que as normas já descreviam (risco alto sem reunião marcada, sem contato há 30+ dias, cadência vencendo, cliente sem análise) em cartões na tela do monitorIA, cada um com uma `pergunta` pronta que o botão dispara no chat — o cartão é a porta de entrada da conversa, não um aviso passivo.

Decisões que valem manter: nada é gravado (alerta é derivado, recalculado a cada chamada, então não há estado obsoleto); nada é calculado aqui (reusa `buscarVencendo`/`buscarAlertasSemAcompanhamento`/`isClienteAtivo`, senão a tela teria uma segunda versão da verdade sobre cadência); e um cliente com dois problemas aparece **uma vez só**, no mais grave.

### Conversa do chat persiste no navegador

Sair da página desmontava o componente e zerava o histórico — junto com o contexto, já que a rota de chat é stateless e é o frontend que reenvia o histórico a cada mensagem. Agora vai pro `localStorage` (`assistenteIA:conversa`), com teto de 40 mensagens e botão "Nova". **Não** vai pro banco de propósito: o app não tem autenticação e é servido na LAN, então uma conversa no SQLite seria a de todo mundo misturada, sem dono.

### `plano_implementacao.md` — roadmap antigo (GestorPro), desalinhado

Documenta um plano **anterior e não implementado** de transformar o projeto em um produto multi-usuário genérico "GestorPro" (PostgreSQL, JWT, multi-tenant, navbar superior). Esse plano é anterior ao pivô para "2D Consultores / Carteira de Monitoria" e à decisão de manter tudo em Excel dentro do OneDrive — **não reflete a direção atual do produto**. Não usar como fonte de verdade sem confirmar antes com o usuário.

## Segurança e privacidade

- Sistema **estritamente local/offline** no app em si, por design. Qualquer mudança no backend deve preservar o bind em `127.0.0.1` e o CORS restrito — não abrir para `0.0.0.0` nem ampliar origens permitidas sem confirmar com o usuário.
- Os dados reais de clientes vivem no OneDrive corporativo do usuário, não neste repositório — não há `database_dev.xlsx`/`uploads/` na pasta do projeto para gitignorar (nada a versionar por engano aqui hoje, embora `*.xlsx` já esteja no `.gitignore` por segurança).
