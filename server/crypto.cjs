/**
 * Cifra/decifra a senha do cliente no Price (AES-256-GCM). Único consumidor
 * hoje: `routes/clients.cjs` (grava cifrado, nunca em texto puro) e a futura
 * rota de revelar credencial pro helper local do Selenium.
 *
 * A CHAVE (`server/config.cjs`) tem duas fontes, nesta ordem:
 *   1. `PRICE_CREDENCIAIS_CHAVE` no `.env` da máquina — override manual,
 *      opcional (nunca obrigatório desde a correção abaixo).
 *   2. `PRICE_CREDENCIAIS_CHAVE_PATH`, um arquivo dentro do OneDrive (mesmo
 *      padrão de `CEO_AGENDA_OAUTH_TOKEN_PATH`) — AUTO-PROVISIONADO: a
 *      primeira máquina que precisar da chave e não tiver (1) gera uma
 *      aleatória e grava esse arquivo; toda máquina depois disso lê o MESMO
 *      arquivo pelo sync do OneDrive, sem configuração manual nenhuma.
 *
 * Por que isso existe: a premissa original era "só a máquina servidora
 * cifra" — falsa (cada máquina cifra localmente, ver comentário em
 * `config.cjs`), e isso já derrubou o Price numa máquina real com
 * "PRICE_CREDENCIAIS_CHAVE não configurada". Guardar a chave dentro do
 * OneDrive parece contradizer "nunca no banco" do comentário antigo, mas não
 * é a mesma coisa: quem tem acesso ao OneDrive JÁ tem acesso de leitura/
 * escrita ao Excel/SQLite inteiro (é a mesma pasta) — a proteção real daqui
 * sempre foi contra abrir a planilha e ver a senha em texto puro na coluna,
 * não contra um atacante com acesso de arquivo à pasta de dados inteira.
 * Mesmo trade-off já aceito por `CEO_AGENDA_OAUTH_TOKEN_PATH`.
 *
 * GCM (não CBC) de propósito: autentica o texto cifrado — se alguém editar a
 * célula da planilha à mão (ou corromper), `decifrar` detecta e erra, em vez
 * de devolver lixo como se fosse uma senha válida.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { PRICE_CREDENCIAIS_CHAVE, PRICE_CREDENCIAIS_CHAVE_PATH } = require('./config.cjs');

const ALGORITMO = 'aes-256-gcm';
const TAMANHO_CHAVE = 32; // AES-256
const TAMANHO_IV = 12; // recomendado pro GCM

/**
 * Lê a chave do arquivo compartilhado (OneDrive); se não existir ainda,
 * GERA uma nova e grava — só a primeira máquina a chamar isto em toda a
 * carteira faz esse caminho, todas as outras só leem o que já foi
 * sincronizado. `{ flag: 'wx' }` (falha se já existir) mais um catch que
 * relê: fecha a corrida de duas máquinas gerando ao mesmo tempo — quem
 * perder a corrida de escrita simplesmente lê o que a outra gravou.
 */
function chaveDoArquivoCompartilhado() {
  try {
    return fs.readFileSync(PRICE_CREDENCIAIS_CHAVE_PATH, 'utf8').trim();
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const nova = crypto.randomBytes(32).toString('base64');
  try {
    fs.mkdirSync(path.dirname(PRICE_CREDENCIAIS_CHAVE_PATH), { recursive: true });
    fs.writeFileSync(PRICE_CREDENCIAIS_CHAVE_PATH, nova, { flag: 'wx' });
    return nova;
  } catch (err) {
    if (err.code === 'EEXIST') return fs.readFileSync(PRICE_CREDENCIAIS_CHAVE_PATH, 'utf8').trim();
    throw err;
  }
}

/** Deriva uma chave de 32 bytes a partir do texto (aceita qualquer tamanho de
 *  entrada — scrypt normaliza) — evita exigir que o usuário monte uma chave
 *  hex/base64 exata de 32 bytes na mão. `salt` fixo é aceitável aqui: o
 *  segredo real é o texto em si, não o salt, e uma única chave serve pra
 *  todo o banco (não é senha de usuário, não precisa de salt por registro). */
function derivarChave() {
  const texto = PRICE_CREDENCIAIS_CHAVE || chaveDoArquivoCompartilhado();
  return crypto.scryptSync(texto, 'carteira-price-credenciais', TAMANHO_CHAVE);
}

/** `null`/string vazia vira string vazia (não cifra "nada") — evita gravar um
 *  blob cifrado só pra representar "sem senha". */
function cifrar(texto) {
  if (!texto) return '';
  const chave = derivarChave();
  const iv = crypto.randomBytes(TAMANHO_IV);
  const cipher = crypto.createCipheriv(ALGORITMO, chave, iv);
  const cifrado = Buffer.concat([cipher.update(String(texto), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // iv + tag + cifrado, tudo num base64 só — formato auto-contido, não precisa
  // de coluna extra pra guardar o iv.
  return Buffer.concat([iv, tag, cifrado]).toString('base64');
}

function decifrar(cifradoBase64) {
  if (!cifradoBase64) return '';
  const chave = derivarChave();
  const dados = Buffer.from(cifradoBase64, 'base64');
  const iv = dados.subarray(0, TAMANHO_IV);
  const tag = dados.subarray(TAMANHO_IV, TAMANHO_IV + 16);
  const cifrado = dados.subarray(TAMANHO_IV + 16);
  const decipher = crypto.createDecipheriv(ALGORITMO, chave, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(cifrado), decipher.final()]).toString('utf8');
  } catch (err) {
    throw new Error(`Falha ao decifrar credencial do Price — chave errada ou dado corrompido: ${err.message}`);
  }
}

module.exports = { cifrar, decifrar };
