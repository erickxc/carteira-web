# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Visão geral

"Carteira Web" é a **carteira de monitoria da 2D Consultores**: controle de agendamento de reuniões com clientes, histórico de análises por cliente, anotações, status de cliente (monitoria de risco/relacionamento), lembretes de agendamentos, fila de priorização por cadência (Acompanhamento/Ações) e anexos de reunião. Frontend em **React 19 + TypeScript + Vite**, backend em **Express** com persistência em Excel (`database_dev.xlsx`) + upload de arquivos — **ambos gravados dentro de uma pasta do OneDrive**, nunca na pasta do projeto (ver seção abaixo). **Sem autenticação e sem servidor de banco/nuvem** — mas servido na **rede local (LAN)** para vários usuários da 2D via Apache (XAMPP) fazendo proxy reverso pro backend (ver "Deploy em produção" abaixo). Identidade visual **preto e branco** (logo 2D Consultores: ícone de seta ascendente).

## Comandos

```bash
npm install         # instalar dependências
npm start           # roda backend (server.cjs, porta 3001) + Vite dev server (porta 5173) via concurrently
npm run dev         # só o Vite dev server
node server.cjs     # só o backend Express (falha ao subir se a pasta do OneDrive não existir — ver abaixo)
npm run build       # tsc -b && vite build — falha se houver erro de tipo
npm run lint        # ESLint (TS) sobre todo o projeto
npm run preview     # preview do build de produção
```

Não há suíte de testes configurada. `npm run build` (roda `tsc -b` antes do Vite) é o único gate automático — rode-o depois de qualquer mudança de tipo/estrutura.

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
                                /api, /uploads = proxy reverso → Node 127.0.0.1:3001
```

- **Apache é o único ponto exposto na rede.** O Node só escuta em loopback (`127.0.0.1:3001`) — inacessível direto pela LAN. Config em `C:\xampp\apache\conf\extra\httpd-vhosts.conf` (vhost dedicado, porta 8080, `ServerName carteira.local`): `DocumentRoot` = `C:/projects/Carteira Web/dist`, `RewriteRule` de fallback pro `index.html` (SPA do React Router, exceto `/api/` e `/uploads/`), e `ProxyPass`/`ProxyPassReverse` de `/api` e `/uploads` pra `127.0.0.1:3001`.
- **Inicialização automática** (sem terminal aberto):
  - **Apache**: instalado como **serviço do Windows** (`Apache2.4`, StartType=Automatic) — sobe no boot.
  - **Node**: **Tarefa Agendada** `CarteiraWeb-Backend` (ao logon, roda oculto via `iniciar-servidor.vbs` na raiz do projeto). O `.vbs` é **agnóstico de máquina** (pasta do projeto = onde o próprio `.vbs` está; caminho do OneDrive vem de um `.env` na raiz do projeto, se existir — sem `.env`, cai no default de `server/config.cjs`) e **espera a pasta do OneDrive montar** antes de subir o Node (senão o `server.cjs` sai com erro no boot antes do OneDrive sincronizar).
- **Depende de login**: Apache sobe sem login, mas o Node (os dados) só sobe após o **logon do usuário da máquina** (`Kerol`) — é de onde vem o acesso ao OneDrive. A máquina precisa ficar logada nesse usuário. Inerente ao desenho de dados no OneDrive.
- **Ao mudar o código do frontend**: rodar `npm run build` (regenera `dist/`, que é o que o Apache serve) — só recarregar a página não basta, o Apache serve o build, não o Vite dev.
- **Ao mudar código do backend** (`server.cjs`, `server/*.cjs`): a Tarefa Agendada precisa reiniciar (`Stop-ScheduledTask`/`Start-ScheduledTask` no PowerShell, ou matar o processo `node.exe` rodando `server.cjs` e deixar a tarefa relançar) — só o build do frontend não basta.
- **Sem autenticação, servido na LAN**: qualquer um na rede acessa e edita tudo, sem senha (decisão do usuário, uso interno). Se o roteador encaminhar a porta 8080 pra internet, o sistema inteiro fica exposto pra fora — verificar no roteador antes de assumir que é só interno.

## Arquitetura

### Backend (`server.cjs`)

API Express minimalista, CommonJS (`.cjs`), sem build step, roda direto com `node server.cjs`:

- Escuta estritamente em `127.0.0.1:3001` — nunca `0.0.0.0`. O default de `HOST` em `server.cjs` é `127.0.0.1` (loopback): em produção o Apache faz proxy reverso pro backend na própria máquina, então o Node **nunca** fica exposto direto na rede. A env `APP_HOST` ainda permite bindar num IP de LAN pra rodar `npm start` (dev) acessível por outras máquinas sem Apache. CORS restrito à origem do Vite dev server (`localhost:5173` / `127.0.0.1:5173`) — em produção o CORS nem é acionado (mesma origem via proxy).
- **Persistência**: `database_dev.xlsx` dentro do OneDrive (ver seção acima), lido/escrito via `xlsx` (SheetJS) — sem banco real, sem ORM. Cada entidade é uma sheet, headers fixos em `HEADERS_BY_SHEET` (`server/config.cjs`): `Clientes`, `Agenda`, `Lembretes`, `Categorias`, `Acoes`, `Modelos`, `Cadencias`. `getSheetData`/`saveSheetData` fazem leitura/escrita **completa** do arquivo a cada chamada — sem transação/locking, chamadas concorrentes podem se sobrescrever. Isso também significa: se o OneDrive estiver sincronizando o arquivo no momento de uma escrita, pode haver conflito — não é um caso tratado hoje.
- **Campos aninhados (arrays/objetos) não sobrevivem ao `json_to_sheet` do SheetJS** — por isso campos como `contatos`/`servicos` (Cliente), `servicos`/`monitores`/`checklist`/`attachments` (EventoAgenda) são serializados para JSON string no frontend (`src/api/client.ts`, funções `serialize*`/`deserialize*`) antes de enviar, e desserializados na leitura. Se adicionar um novo campo estruturado (não string/number/boolean), siga o mesmo padrão e inclua a coluna em `HEADERS_BY_SHEET` — senão vira `"[object Object]"` na célula, ou (se faltar em `HEADERS_BY_SHEET`) é apagado de todas as linhas no próximo save da aba inteira.
- **`Categorias`** guarda todos os valores configuráveis por tipo (`servico`, `tipo_evento`, `status_cliente`, `status_evento`, `monitor`, `tipo_lembrete`, `sala`) — status de cliente/evento **não são enums fixos no código**, são dados editáveis em Configurações (`opcoesPorTipo` no `CarteiraContext`). Ao adicionar um valor novo em produção (ex.: um status novo), lembre que o *seed* (`CATEGORIAS_SEED`) só roda na criação da planilha — bases já existentes precisam do valor inserido via API/UI também, não só no seed.
- **Anexos**: upload local via `multer` (`POST /api/uploads`, campo `file`), arquivos gravados em `uploads/` dentro da pasta do OneDrive, nome `${crypto.randomUUID()}-${originalname}`, servidos estaticamente em `/uploads/:filename`. `DELETE /api/uploads/:filename` usa `path.basename()` no parâmetro para evitar path traversal. Deletar um cliente/evento **não** apaga os arquivos físicos associados — limpeza manual hoje, não automática.
- `initDB()` cria o workbook com headers fixos na primeira execução. **Precisa terminar com `xlsx.writeFile`** no ramo "arquivo não existe" — já houve um bug real aqui em que esse `writeFile` faltava e a API quebrava com ENOENT no primeiro boot.
- IDs são gerados no frontend (`uuid`) e enviados no corpo da requisição — o servidor não gera IDs.
- Deletar um cliente (`DELETE /api/clients/:id`) faz cascade delete manual dos itens de agenda vinculados (`clientId`) — não existe FK/constraint de banco aqui (é Excel), a integridade é toda responsabilidade do código em `server.cjs`.

### Frontend (`src/`)

Base de design e estrutura herdada do **Projeto Prisma** (outro projeto interno): mesmo padrão de `glass-card`/`stat-card-*`/`custom-select`/modal, e mesma separação `api/` + `types/` + `hooks/` + `pages/` + `components/` + `context/`. A paleta foi adaptada para **preto e branco** (identidade 2D Consultores) — `--accent` é branco (não indigo), só os badges de status semântico (sucesso/atenção/perigo) mantêm cor.

- **Navegação**: sidebar lateral fixa (`src/components/Sidebar.tsx`, não navbar superior) com logo + nav + ações rápidas (Buscar Ctrl+K, Novo Evento, Novo Lembrete). Roteamento via `react-router-dom` (`src/App.tsx`): `/` (Dashboard), `/clientes`, `/clientes/:id` (detalhe do cliente), `/agenda`, `/acoes` (Acompanhamento + Ações), `/contatos`, `/relatorios`, `/config` (Configurações). Sem autenticação/rota protegida — fora de escopo.
- **Estado global**: `CarteiraContext` (`src/context/CarteiraContext.tsx`) busca clientes/agenda/lembretes/categorias/ações/modelos/cadências uma vez no mount e expõe CRUD tipado + helpers (`enviarAnexoEvento`, `removerAnexoEvento`, `criarLembrete`, `registrarAcao`, `salvarCadencias`, `criarCategoria`/`atualizarCategoria`/`removerCategoria`, `opcoesPorTipo`); todas as páginas leem daqui via `useCarteira()`. `src/api/client.ts` é o único lugar que fala com a API. A base da API é **condicional ao modo** (`import.meta.env.DEV`): em **dev** usa URL absoluta (`http://<hostname>:3001/api`, portas separadas); em **produção** usa **caminho relativo** (`/api`, `/uploads`) — o Apache resolve via proxy, então nenhum IP/porta fica hardcoded no build. Não volte a hardcodar host/porta aqui.
- **Cliente** (`Cliente` em `src/types/index.ts`): dois campos de situação, **não um só**:
  - `estado?: 'Ativo' | 'Inativo'` — liga/desliga o cliente das contas de cadência/Ações/Dashboard (`isClienteAtivo` em `src/utils/formatters.ts`).
  - `status: string` — situação mais granular, valores em `CLIENTE_STATUS_OPCOES` (`Regular | Suspenso | Atendido pelo Marco | Gratuidade | Problemas Externos`).
  - `isClienteAtivo` exige os **dois**: `estado === 'Ativo'` **e** `status` sendo um dos "em atendimento" (`Regular`/`Gratuidade`/vazio/legado `Ativo`) — só `estado` sem checar `status` foi um bug real (cliente "Atendido pelo Marco" com `estado=Ativo` contava como ativo normal em tudo). Sem `estado` preenchido (dado legado), cai no fallback antigo (`status` começando com `ativ`/`gratuidade`).
  - `observacao: string` é texto livre — não existe mais lista de notas timestampadas (`Nota[]`).
- **Evento de Agenda** (`EventoAgenda`): tem `subject` (assunto da reunião, obrigatório) além de `description`, `attachments: Anexo[]`, e `monitores: string[]` (**múltipla escolha** desde que a reunião passou a poder ter mais de um monitor — antes era `monitor?: string` único; conflito de horário considera qualquer monitor em comum entre dois eventos). `status` (`EventoStatus = string`) é igual ao de Cliente: valores livres, configuráveis via categoria `status_evento` (inclui `Pendente`, adicionado depois do seed original — qualquer status novo funciona sem mudança de código, contanto que não colida com os regexes de classificação: `/conclu|realiz/i` = concluído, `/cancel|reagend/i` = cancelado). **Upload de anexo só é permitido em modo de edição** (evento já existe) — `EventFormModal` esconde a seção de anexos ao criar um evento novo, mostrando "salve o evento primeiro". Isso é intencional (upload precisa de um id para associar), não um bug.
- **Fila de priorização por cadência** (`buildFilaCadencia` em `src/utils/cadenciaServico.ts`, usada em `/acoes` e nas sugestões de agenda): ordena por (1) severidade (vencido/nunca > vencendo > em dia), (2) **quantidade de serviços ruins** — cliente atrasado em 2 serviços sempre vem antes de atrasado em 1, mesmo com atraso "pior" no de 1 só —, (3) contato recente não refletido na cadência (empurra pro fim do próprio bloco), (4) atraso em dias. "Nunca atendido" conta o atraso em **dias reais desde que o cliente entrou na carteira** (`createdAt`), não mais um peso fixo artificial — esse peso fixo fazia um cliente com 1 serviço em dia + 1 nunca atendido pular pra frente de quem estava vencido há 100+ dias nos dois serviços, só pela distorção de escala.
- **Navegação entre páginas com contexto** (busca global levando para uma data na Agenda, botões "Novo Evento"/"Novo Lembrete" pré-preenchendo o cliente) usa `navigate(path, { state: {...} })` + `useLocation().state`. Atenção: o `useEffect` que lê esse `state` em `AgendaPage` precisa depender de `location.key` (não de `[]`) — senão navegações repetidas para a mesma rota já montada não disparam o efeito. Já foi um bug real aqui.
- **Cuidado com datas `type="date"`**: um `<input type="date">` produz uma string tipo `"2026-07-16"`; `new Date("2026-07-16")` é interpretada como **UTC meia-noite** pelo motor JS, o que desloca um dia para trás em fusos negativos (ex.: Brasil) quando reformatada em hora local — já foi um bug real em `EventFormModal`. Use `parse(dateStr, 'yyyy-MM-dd', new Date())` do `date-fns` (parse em hora local) antes de `.toISOString()`, nunca o construtor `new Date(string)` direto para strings de data pura.
- **Feriados brasileiros** (`src/utils/holidays.ts`): nacionais fixos + móveis (Páscoa via algoritmo Gregoriano), estaduais RJ e municipais Duque de Caxias. `previousBusinessDay()` implementa o "cálculo de dia útil retroativo" — usado por `ReminderPopup` para antecipar notificações que caem em fim de semana/feriado.
- **Lembretes recorrentes** (`src/components/ReminderPopup.tsx`): polling a cada 20s, dispara toast in-app (**sem** `Notification` API nativa — removida de propósito: app servido em HTTP puro na LAN, não é "contexto seguro", o Chrome nega essa API em silêncio nesse caso), auto-dismiss em 45s ou fechamento manual, recalcula a próxima ocorrência (`daily`/`weekly`/`monthly`) ou marca `concluido` se não houver recorrência. `Lembrete.eventId` (opcional) permite ligar um lembrete a uma reunião específica.

### `plano_implementacao.md` — roadmap antigo (GestorPro), desalinhado

Documenta um plano **anterior e não implementado** de transformar o projeto em um produto multi-usuário genérico "GestorPro" (PostgreSQL, JWT, multi-tenant, navbar superior). Esse plano é anterior ao pivô para "2D Consultores / Carteira de Monitoria" e à decisão de manter tudo em Excel dentro do OneDrive — **não reflete a direção atual do produto**. Não usar como fonte de verdade sem confirmar antes com o usuário.

## Segurança e privacidade

- Sistema **estritamente local/offline** no app em si, por design. Qualquer mudança no backend deve preservar o bind em `127.0.0.1` e o CORS restrito — não abrir para `0.0.0.0` nem ampliar origens permitidas sem confirmar com o usuário.
- Os dados reais de clientes vivem no OneDrive corporativo do usuário, não neste repositório — não há `database_dev.xlsx`/`uploads/` na pasta do projeto para gitignorar (nada a versionar por engano aqui hoje, embora `*.xlsx` já esteja no `.gitignore` por segurança).
