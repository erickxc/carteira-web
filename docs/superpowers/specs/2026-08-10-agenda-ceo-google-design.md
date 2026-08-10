# Agenda do CEO (Google Calendar, somente leitura) — Design

## Contexto

O CEO da 2D Consultores mantém uma agenda pública no Google Calendar (`negocios@2dconsultores.com.br`), exposta via link iCal público:

```
https://calendar.google.com/calendar/ical/negocios%402dconsultores.com.br/public/basic.ics
```

Objetivo: exibir esses compromissos dentro da `AgendaPage` da Carteira Web, para consulta rápida (ex: saber se o CEO está disponível antes de agendar algo com um cliente), sem nenhuma integração de escrita e sem risco para a Agenda existente da Carteira.

## Restrição inegociável

**Zero impacto na Agenda atual.** É uma camada nova, isolada e aditiva:
- Não altera sheets (`Clientes`, `Agenda`, `Lembretes`), endpoints ou tipos existentes.
- Falha de rede, parsing ou indisponibilidade do Google **nunca** derruba o servidor nem afeta os demais endpoints — degrada silenciosamente (a Agenda da Carteira continua 100% funcional sem a camada do CEO).
- Nenhuma escrita no Google Calendar — somente leitura de um `.ics` público.

## Backend

### Novo módulo `ceoAgenda.cjs`

Isolado do restante do `server.cjs` (que só o importa e registra a rota). Responsabilidades:

- Buscar o `.ics` via `fetch` na URL (guardada em variável de ambiente `CEO_AGENDA_ICS_URL`, nunca hardcoded no código — permite trocar sem deploy).
- Parsear com a lib `node-ical`.
- Filtrar eventos: descarta os com `end` anterior ao 1º dia do mês corrente (janela = mês atual em diante, sem limite futuro).
- Normalizar cada evento para: `{ id, title, start, end, location, allDay }` — sem qualquer campo do domínio da Carteira (sem `clientId`, `attachments`, notas). Esses eventos nunca entram nas sheets do Excel.
- Manter cache em memória: `{ events: EventoCeo[], lastSync: string|null, lastError: string|null }`.

### Sincronização

- Fetch inicial no boot do servidor (dentro de `try/catch` — se falhar, cache fica com `events: []`, `lastError` preenchido, servidor sobe normalmente).
- Depois, `setInterval` a cada 24h refazendo o fetch. Erros são logados e mantêm o cache anterior (não zera eventos válidos por causa de uma falha pontual).
- Nenhum fetch síncrono acontece durante uma requisição HTTP — o endpoint só lê o cache já pronto, latência zero adicional pra quem consome.

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

- `node-ical` (parsing de `.ics`, only-read, sem SDK do Google, sem OAuth).

## Fora de escopo

- Escrita/criação de eventos no Google Calendar.
- Autenticação OAuth (desnecessária — calendário é público).
- Sincronização em tempo real (frequência decidida: 1x/dia).
- Suporte a mais de uma agenda externa (só a do CEO, por enquanto).
