// Script local, roda UMA VEZ SÓ — não faz parte do servidor. Autoriza a
// leitura da Agenda do CEO (Google Calendar) com a própria conta dona da
// agenda (negocios@2dconsultores.com.br) e salva o refresh_token, que o
// backend (server/ceoAgenda.cjs) reutiliza indefinidamente depois disso.
//
// Uso: node server/scripts/authorizeCeoAgenda.cjs
// Abre uma URL do Google no terminal — copie e cole no navegador, faça login
// com a conta negocios@2dconsultores.com.br e autorize. O script recebe o
// retorno automaticamente (servidor HTTP local temporário) e salva o token.

const fs = require('fs');
const http = require('http');
const { OAuth2Client } = require('google-auth-library');
const { CEO_AGENDA_OAUTH_CLIENT_PATH, CEO_AGENDA_OAUTH_TOKEN_PATH } = require('../config.cjs');

const PORTA_LOCAL = 41823;
const REDIRECT_URI = `http://localhost:${PORTA_LOCAL}`;

if (!fs.existsSync(CEO_AGENDA_OAUTH_CLIENT_PATH)) {
  console.error(`Arquivo de credencial OAuth não encontrado em: ${CEO_AGENDA_OAUTH_CLIENT_PATH}`);
  process.exit(1);
}

const { installed } = JSON.parse(fs.readFileSync(CEO_AGENDA_OAUTH_CLIENT_PATH, 'utf-8'));
const client = new OAuth2Client(installed.client_id, installed.client_secret, REDIRECT_URI);

const authUrl = client.generateAuthUrl({
  access_type: 'offline', // obrigatório para receber refresh_token
  prompt: 'consent', // força novo refresh_token mesmo se já autorizou antes
  scope: ['https://www.googleapis.com/auth/calendar.readonly'],
});

console.log('\nAbra esta URL no navegador (faça login com negocios@2dconsultores.com.br):\n');
console.log(authUrl);
console.log('\nAguardando autorização...\n');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  const code = url.searchParams.get('code');
  if (!code) {
    res.writeHead(400).end('Código de autorização não encontrado na URL.');
    return;
  }
  try {
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
      throw new Error(
        'Google não retornou refresh_token. Se essa conta já autorizou este app antes, revogue o ' +
        'acesso em https://myaccount.google.com/permissions e rode o script de novo.'
      );
    }
    fs.writeFileSync(CEO_AGENDA_OAUTH_TOKEN_PATH, JSON.stringify(tokens, null, 2));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      .end('<h2>Autorizado! Pode fechar esta aba e voltar ao terminal.</h2>');
    console.log(`Token salvo em: ${CEO_AGENDA_OAUTH_TOKEN_PATH}`);
    console.log('Pronto — o backend já pode usar a Agenda do CEO.');
  } catch (err) {
    res.writeHead(500).end('Falha ao trocar código por token. Veja o terminal.');
    console.error('Erro:', err.message);
  } finally {
    server.close();
    process.exit(0);
  }
});

server.listen(PORTA_LOCAL);
