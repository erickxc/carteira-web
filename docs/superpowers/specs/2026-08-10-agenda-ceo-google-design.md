# Agenda do CEO (Google Calendar, somente leitura) — Design

> **Nota de implementação (2026-08-10):** o plano original abaixo previa ler
> um link `.ics` público. Na prática, o link público não estava configurado
> (404) e a alternativa via Service Account esbarrou numa restrição do
> Google Workspace (contas fora do domínio só recebem "Ver disponibilidade",
> nunca "Ver todos os detalhes do evento"). A implementação final usa
> **OAuth 2.0** autorizado uma única vez pela própria conta dona da agenda
> (`negocios@2dconsultores.com.br`) via script local
> (`server/scripts/authorizeCeoAgenda.cjs`), que gera um `refresh_token`
> reutilizado indefinidamente pelo backend. O restante do design (cache
> diário, endpoint `/api/ceo-agenda`, isolamento total da Agenda existente,
> toggle + chip distinto no frontend) permanece como descrito abaixo.

## Contexto

O CEO da 2D Consultores mantém uma agenda no Google Calendar
(`negocios@2dconsultores.com.br`). Objetivo: exibir esses compromissos dentro
da `AgendaPage` da Carteira Web, para consulta rápida (ex: saber se o CEO está
disponível antes de agendar algo com um cliente), sem nenhuma integração de
escrita e sem risco para a Agenda existente da Carteira.

## Restrição inegociável

**Zero impacto na Agenda atual.** É uma camada nova, isolada e aditiva:
- Não altera sheets (`Clientes`, `Agenda`, `Lembretes`), endpoints ou tipos existentes.
- Falha de rede, parsing ou indisponibilidade do Google **nunca** derruba o servidor nem afeta os demais endpoints — degrada silenciosamente (a Agenda da Carteira continua 100% funcional sem a camada do CEO).
- Nenhuma escrita no Google Calendar — somente leitura de um `.ics` público.

## Backend

### Autorização (OAuth, uma vez só)

- `server/scripts/authorizeCeoAgenda.cjs`: script local, roda fora do servidor HTTP. Gera a URL de consentimento do Google, sobe um servidor HTTP temporário em `localhost:41823` pra capturar o `code` do redirect, troca por tokens (`access_type=offline`) e salva em `CEO_AGENDA_OAUTH_TOKEN_PATH`.
- Credencial OAuth (tipo "App para computador") e o token gerado ficam fora do repositório, na pasta do OneDrive (`ceo-agenda-oauth-client.json`, `ceo-agenda-oauth-token.json`) — nunca versionados (reforçado no `.gitignore`).
- Autorizado com a própria conta dona da agenda (`negocios@2dconsultores.com.br`) — acesso total garantido, sem depender de compartilhamento nem de políticas de domínio do Workspace.

### Novo módulo `ceoAgenda.cjs`

Isolado do restante do `server.cjs` (que só o importa e registra a rota). Responsabilidades:

- Montar um `OAuth2Client` (`google-auth-library`) com o `refresh_token` salvo — a lib renova o `access_token` automaticamente quando expira.
- Chamar `GET /calendars/{calendarId}/events` (Calendar API v3) com `timeMin` = 1º dia do mês corrente (janela = mês atual em diante, sem limite futuro), `singleEvents=true`, `orderBy=startTime`.
- Normalizar cada evento para: `{ id, title, start, end, location, allDay }` — sem qualquer campo do domínio da Carteira (sem `clientId`, `attachments`, notas). Esses eventos nunca entram nas sheets do Excel.
- Manter cache em memória: `{ events: EventoCeo[], lastSync: string|null, lastError: string|null }`.

### Sincronização

- Fetch inicial no boot do servidor (dentro de `try/catch` — se falhar, cache fica com `events: []`, `lastError` preenchido, servidor sobe normalmente).
- Depois, `setInterval` a cada 24h refazendo o fetch. Erros são logados e mantêm o cache anterior (não zera eventos válidos por causa de uma falha pontual).
- Nenhuma chamada síncrona acontece durante uma requisição HTTP — o endpoint só lê o cache já pronto, latência zero adicional pra quem consome.

### Endpoint

`GET /api/ceo-agenda` → retorna `{ events, lastSync, lastError }` do cache atual. Somente leitura, sem parâmetros, sem autenticação (mesmo padrão do resto da API).

## Frontend

### Contexto

`CarteiraContext` busca `/api/ceo-agenda` em paralelo com as demais chamadas no mount. Falha é capturada com `catch` silencioso → estado local vira `{ events: [], lastSync: null, lastError: ... }`, sem lançar erro que quebre o carregamento das demais telas.

### `AgendaPage`

- Toggle "Agenda do CEO" no topo da página (perto dos filtros existentes), estado persistido em `localStorage` (`carteira:mostrarAgendaCeo`), padrão desligado.
- Quando ativo, os eventos do CEO são renderizados nas mesmas células de calendário dos eventos da Carteira, com estilo visualmente distinto: borda tracejada, ícone 📅 Google, cor própria (paleta azul Google, única exceção à identidade preto-e-branco do projeto, para diferenciar claramente a origem).
- Eventos do CEO **não são clicáveis para edição** — clique abre um popover somente leitura com título, horário e local. Nenhuma ação de editar/excluir/anexar é exposta.
- Se `lastError` estiver presente (ou `lastSync` nulo) e o toggle estiver ativo, exibe aviso discreto e não bloqueante: "Agenda do CEO indisponível no momento".

## Dependências novas

- `google-auth-library` (cliente OAuth2 + renovação automática de token, sem o SDK completo `googleapis`).

## Fora de escopo

- Escrita/criação de eventos no Google Calendar.
- Botão de (re)conexão dentro do app — a autorização é feita uma única vez via script local; se o `refresh_token` for revogado, basta rodar o script de novo.
- Sincronização em tempo real (frequência decidida: 1x/dia).
- Suporte a mais de uma agenda externa (só a do CEO, por enquanto).
