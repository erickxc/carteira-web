const fs = require('fs');
const path = require('path');
const { OAuth2Client } = require('google-auth-library');
const { CEO_AGENDA_CALENDAR_ID, CEO_AGENDA_OAUTH_CLIENT_PATH, CEO_AGENDA_OAUTH_TOKEN_PATH, DATA_DIR } = require('./config.cjs');
const { isClient } = require('./modo.cjs');

// Cache também persistido em arquivo (dentro do OneDrive, DATA_DIR — pasta
// compartilhada pelas 4 máquinas) — necessário porque a sincronização em si
// (`iniciarSincronizacaoPeriodica`) só roda em `APP_MODE=server` (só a
// Karol-2D tem a credencial OAuth e é ela quem fala com o Google). Sem
// persistir em arquivo, o `cache` em memória das outras 3 máquinas nunca sai
// do valor inicial vazio — bug real encontrado em produção: "Agenda do Marco
// não aparece no outro PC". `getCache()` lê desse arquivo em modo cliente.
const CACHE_FILE = path.join(DATA_DIR, 'ceo-agenda-cache.json');

// Camada 100% isolada da Agenda da Carteira: não lê nem escreve nas sheets do
// Excel, não usa db.cjs, não compartilha estado com nenhuma outra rota. Falha
// aqui (token ausente, rede fora, Google fora do ar) só afeta este cache —
// nunca deve derrubar o servidor nem os demais endpoints.
//
// Autorização: feita uma única vez, fora do servidor, por
// server/scripts/authorizeCeoAgenda.cjs — que gera o refresh_token salvo em
// CEO_AGENDA_OAUTH_TOKEN_PATH. Aqui só reutilizamos esse refresh_token.

let cache = { events: [], lastSync: null, lastError: null };
let timer = null;
let oauthClient = null;

function getOAuthClient() {
  if (oauthClient) return oauthClient;
  if (!fs.existsSync(CEO_AGENDA_OAUTH_CLIENT_PATH)) {
    throw new Error(`Credencial OAuth não encontrada em: ${CEO_AGENDA_OAUTH_CLIENT_PATH}`);
  }
  if (!fs.existsSync(CEO_AGENDA_OAUTH_TOKEN_PATH)) {
    throw new Error(
      `Token de autorização não encontrado em: ${CEO_AGENDA_OAUTH_TOKEN_PATH}. ` +
      'Rode: node server/scripts/authorizeCeoAgenda.cjs'
    );
  }
  const { installed } = JSON.parse(fs.readFileSync(CEO_AGENDA_OAUTH_CLIENT_PATH, 'utf-8'));
  const tokens = JSON.parse(fs.readFileSync(CEO_AGENDA_OAUTH_TOKEN_PATH, 'utf-8'));
  const client = new OAuth2Client(installed.client_id, installed.client_secret);
  client.setCredentials(tokens);
  oauthClient = client;
  return oauthClient;
}

function inicioMesAtual() {
  const agora = new Date();
  return new Date(agora.getFullYear(), agora.getMonth(), 1);
}

/** Normaliza um evento da Calendar API v3 para o formato exposto pela API —
 *  somente campos de exibição, nunca algo que pareça editável (sem id
 *  compatível com EventoAgenda, sem clientId, sem attachments). */
function normalizar(item) {
  const allDay = Boolean(item.start?.date && !item.start?.dateTime);
  const start = item.start?.dateTime || item.start?.date;
  const end = item.end?.dateTime || item.end?.date || null;
  // Evento de dia inteiro: o Google manda só a data ("2026-08-20", sem hora/
  // timezone) representando um dia local, não um instante. Rodar isso por
  // `new Date(...).toISOString()` fixa um instante UTC (meia-noite UTC) que,
  // em qualquer fuso atrás de UTC (ex.: Brasil), volta pro dia anterior ao
  // ser lido no navegador — por isso mantemos a data crua (sem conversão de
  // fuso) e só normalizamos pra ISO instant quando é um evento com horário.
  return {
    id: `ceo-${item.id}`,
    title: item.summary || '(sem título)',
    start: allDay ? (start || null) : (start ? new Date(start).toISOString() : null),
    end: allDay ? (end || null) : (end ? new Date(end).toISOString() : null),
    location: item.location || '',
    allDay,
  };
}

async function sincronizar() {
  try {
    const client = getOAuthClient();
    const timeMin = inicioMesAtual().toISOString();
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CEO_AGENDA_CALENDAR_ID)}/events`);
    url.searchParams.set('timeMin', timeMin);
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('maxResults', '250');

    const res = await client.request({ url: url.toString() });
    const eventos = (res.data.items || [])
      .map(normalizar)
      .filter((e) => e.start);
    cache = { events: eventos, lastSync: new Date().toISOString(), lastError: null };
    escreverCacheEmArquivo();
  } catch (err) {
    // Mantém o cache anterior (events) — uma falha pontual não deve fazer o
    // toggle "Agenda do CEO" esvaziar uma agenda que estava carregada e válida.
    const msg = err.response?.data?.error?.message || err.message;
    console.warn('Falha ao sincronizar Agenda do CEO (mantendo cache anterior):', msg);
    cache = { ...cache, lastError: msg };
    escreverCacheEmArquivo();
  }
}

/** tmp+rename — mesmo padrão do resto do projeto pra arquivo dentro do OneDrive. */
function escreverCacheEmArquivo() {
  try {
    const tmp = `${CACHE_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(cache));
    fs.renameSync(tmp, CACHE_FILE);
  } catch (err) {
    console.warn('Falha ao persistir o cache da Agenda do CEO em arquivo:', err.message);
  }
}

function lerCacheDeArquivo() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
  } catch {
    return { events: [], lastSync: null, lastError: null };
  }
}

const UM_DIA_MS = 24 * 60 * 60 * 1000;

function iniciarSincronizacaoPeriodica() {
  sincronizar();
  if (timer) clearInterval(timer);
  timer = setInterval(sincronizar, UM_DIA_MS);
  // Não impede o processo de encerrar por causa deste timer.
  if (timer.unref) timer.unref();
}

function getCache() {
  return isClient ? lerCacheDeArquivo() : cache;
}

module.exports = { iniciarSincronizacaoPeriodica, getCache };
