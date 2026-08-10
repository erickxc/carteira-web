const fs = require('fs');
const { OAuth2Client } = require('google-auth-library');
const { CEO_AGENDA_CALENDAR_ID, CEO_AGENDA_OAUTH_CLIENT_PATH, CEO_AGENDA_OAUTH_TOKEN_PATH } = require('./config.cjs');

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
  } catch (err) {
    // Mantém o cache anterior (events) — uma falha pontual não deve fazer o
    // toggle "Agenda do CEO" esvaziar uma agenda que estava carregada e válida.
    const msg = err.response?.data?.error?.message || err.message;
    console.warn('Falha ao sincronizar Agenda do CEO (mantendo cache anterior):', msg);
    cache = { ...cache, lastError: msg };
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
  return cache;
}

module.exports = { iniciarSincronizacaoPeriodica, getCache };
