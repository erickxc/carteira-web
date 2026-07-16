# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Visão geral

"Carteira Web" é a **carteira de monitoria da 2D Consultores**: controle de agendamento de reuniões com clientes, histórico de análises por cliente, anotações, status de cliente (monitoria de risco/relacionamento), lembretes de agendamentos e anexos de reunião. Frontend em **React 19 + TypeScript + Vite**, backend em **Express** com persistência em Excel (`database.xlsx`) + upload de arquivos — **ambos gravados dentro de uma pasta do OneDrive**, nunca na pasta do projeto (ver seção abaixo). Uso estritamente local/offline no app em si — sem autenticação, sem servidor externo. Identidade visual **preto e branco** (logo 2D Consultores: ícone de seta ascendente).

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

- Caminho hoje, hardcoded em `server.cjs` (constantes `ONEDRIVE_ROOT` / `DATA_DIR`):
  `C:\Users\Monitor1-2D\OneDrive - 2dconsultores.com.br\01 - Marco + Monitores\6 - Erick\Carteira Web\`
  - `database.xlsx` e a pasta `uploads/` ficam dentro dessa pasta `Carteira Web`.
- **Não existe fallback para pasta local.** Se `ONEDRIVE_ROOT` não existir nesta máquina (OneDrive não sincronizado, pasta renomeada, rodando em outra máquina/usuário), `server.cjs` **falha ao iniciar** (`process.exit(1)` com mensagem clara) em vez de silenciosamente criar os dados em outro lugar. Não "conserte" esse erro adicionando um caminho alternativo — se o caminho mudar de verdade, atualize `ONEDRIVE_ROOT` e avise o usuário, não invente um fallback.
- Já passamos por duas arquiteturas antes de chegar aqui nesta mesma sessão: Excel local na pasta do projeto → PostgreSQL local (instalado via winget) → PostgreSQL hospedado no Render → **Excel dentro do OneDrive (atual)**. O PostgreSQL 17 local instalado via winget (serviço `postgresql-x64-17`) pode continuar instalado na máquina mas **não é mais usado por este projeto** — confirme com o usuário antes de desinstalar (é uma ação de sistema, não só do projeto).

## Arquitetura

### Backend (`server.cjs`)

API Express minimalista, CommonJS (`.cjs`), sem build step, roda direto com `node server.cjs`:

- Escuta estritamente em `127.0.0.1:3001` — nunca `0.0.0.0`. CORS restrito à origem do Vite dev server (`localhost:5173` / `127.0.0.1:5173`).
- **Persistência**: `database.xlsx` dentro do OneDrive (ver seção acima), lido/escrito via `xlsx` (SheetJS) — sem banco real, sem ORM. Cada entidade é uma sheet: `Clientes`, `Agenda`, `Lembretes`. `getSheetData`/`saveSheetData` fazem leitura/escrita **completa** do arquivo a cada chamada — sem transação/locking, chamadas concorrentes podem se sobrescrever. Isso também significa: se o OneDrive estiver sincronizando o arquivo no momento de uma escrita, pode haver conflito — não é um caso tratado hoje.
- **Campos aninhados (arrays/objetos) não sobrevivem ao `json_to_sheet` do SheetJS** — por isso `notas` (Cliente) e `attachments` (EventoAgenda) são serializados para JSON string no frontend (`src/api/client.ts`, funções `serialize*`/`deserialize*`) antes de enviar, e desserializados na leitura. Se adicionar um novo campo estruturado (não string/number/boolean), siga o mesmo padrão — senão vira `"[object Object]"` na célula.
- **Anexos**: upload local via `multer` (`POST /api/uploads`, campo `file`), arquivos gravados em `uploads/` dentro da pasta do OneDrive, nome `${crypto.randomUUID()}-${originalname}`, servidos estaticamente em `/uploads/:filename`. `DELETE /api/uploads/:filename` usa `path.basename()` no parâmetro para evitar path traversal. Deletar um cliente/evento **não** apaga os arquivos físicos associados — limpeza manual hoje, não automática.
- `initDB()` cria o workbook com headers fixos na primeira execução. **Precisa terminar com `xlsx.writeFile`** no ramo "arquivo não existe" — já houve um bug real aqui em que esse `writeFile` faltava e a API quebrava com ENOENT no primeiro boot.
- IDs são gerados no frontend (`uuid`) e enviados no corpo da requisição — o servidor não gera IDs.
- Deletar um cliente (`DELETE /api/clients/:id`) faz cascade delete manual dos itens de agenda vinculados (`clientId`) — não existe FK/constraint de banco aqui (é Excel), a integridade é toda responsabilidade do código em `server.cjs`.

### Frontend (`src/`)

Base de design e estrutura herdada do **Projeto Prisma** (outro projeto interno): mesmo padrão de `glass-card`/`stat-card-*`/`custom-select`/modal, e mesma separação `api/` + `types/` + `hooks/` + `pages/` + `components/` + `context/`. A paleta foi adaptada para **preto e branco** (identidade 2D Consultores) — `--accent` é branco (não indigo), só os badges de status semântico (sucesso/atenção/perigo) mantêm cor.

- **Navegação**: sidebar lateral fixa (`src/components/Sidebar.tsx`, não navbar superior) com logo + nav (Dashboard/Clientes/Agenda) + ações rápidas (Buscar Ctrl+K, Novo Evento, Novo Lembrete). Roteamento via `react-router-dom`: `/`, `/clientes`, `/clientes/:id` (detalhe do cliente), `/agenda`. Sem autenticação/rota protegida — fora de escopo.
- **Estado global**: `CarteiraContext` (`src/context/CarteiraContext.tsx`) busca clientes/agenda/lembretes uma vez no mount e expõe CRUD tipado + helpers (`adicionarNota`, `enviarAnexoEvento`, `removerAnexoEvento`); todas as páginas leem daqui via `useCarteira()`. `src/api/client.ts` é o único lugar que fala com a API (`http://127.0.0.1:3001/api`, URL absoluta).
- **Cliente** (`Cliente` em `src/types/index.ts`): `status` é um de `normalizado | em_analise | inadimplente | deixou_de_comprar` (`CLIENTE_STATUS_OPCOES`), e `notas: Nota[]` é uma lista de anotações timestampadas (não mais um campo `observacao` livre). A página `/clientes/:id` (`ClienteDetailPage`) é onde notas e histórico de reuniões (agenda filtrada por `clientId`) vivem — a tabela de `/clientes` só mostra um resumo (contagem de notas, badge de status).
- **Evento de Agenda** (`EventoAgenda`): tem `subject` (assunto da reunião, obrigatório) além de `description`, e `attachments: Anexo[]`. **Upload de anexo só é permitido em modo de edição** (evento já existe) — `EventFormModal` esconde a seção de anexos ao criar um evento novo, mostrando "salve o evento primeiro". Isso é intencional (upload precisa de um id para associar), não um bug.
- **Navegação entre páginas com contexto** (busca global levando para uma data na Agenda, botões "Novo Evento"/"Novo Lembrete" pré-preenchendo o cliente) usa `navigate(path, { state: {...} })` + `useLocation().state`. Atenção: o `useEffect` que lê esse `state` em `AgendaPage` precisa depender de `location.key` (não de `[]`) — senão navegações repetidas para a mesma rota já montada não disparam o efeito. Já foi um bug real aqui.
- **Cuidado com datas `type="date"`**: um `<input type="date">` produz uma string tipo `"2026-07-16"`; `new Date("2026-07-16")` é interpretada como **UTC meia-noite** pelo motor JS, o que desloca um dia para trás em fusos negativos (ex.: Brasil) quando reformatada em hora local — já foi um bug real em `EventFormModal`. Use `parse(dateStr, 'yyyy-MM-dd', new Date())` do `date-fns` (parse em hora local) antes de `.toISOString()`, nunca o construtor `new Date(string)` direto para strings de data pura.
- **Feriados brasileiros** (`src/utils/holidays.ts`): nacionais fixos + móveis (Páscoa via algoritmo Gregoriano), estaduais RJ e municipais Duque de Caxias. `previousBusinessDay()` implementa o "cálculo de dia útil retroativo" — usado por `ReminderPopup` para antecipar notificações que caem em fim de semana/feriado.
- **Lembretes recorrentes** (`src/components/ReminderPopup.tsx`): polling a cada 20s, dispara notificação nativa (`Notification` API) + toast in-app, recalcula a próxima ocorrência (`daily`/`weekly`/`monthly`) ou marca `concluido` se não houver recorrência. `Lembrete.eventId` (opcional) permite ligar um lembrete a uma reunião específica.

### `plano_implementacao.md` — roadmap antigo (GestorPro), desalinhado

Documenta um plano **anterior e não implementado** de transformar o projeto em um produto multi-usuário genérico "GestorPro" (PostgreSQL, JWT, multi-tenant, navbar superior). Esse plano é anterior ao pivô para "2D Consultores / Carteira de Monitoria" e à decisão de manter tudo em Excel dentro do OneDrive — **não reflete a direção atual do produto**. Não usar como fonte de verdade sem confirmar antes com o usuário.

## Segurança e privacidade

- Sistema **estritamente local/offline** no app em si, por design. Qualquer mudança no backend deve preservar o bind em `127.0.0.1` e o CORS restrito — não abrir para `0.0.0.0` nem ampliar origens permitidas sem confirmar com o usuário.
- Os dados reais de clientes vivem no OneDrive corporativo do usuário, não neste repositório — não há mais `database.xlsx`/`uploads/` na pasta do projeto para gitignorar (nada a versionar por engano aqui hoje).
