/**
 * Cifra/decifra a senha do cliente no Price (AES-256-GCM). Único consumidor
 * hoje: `routes/clients.cjs` (grava cifrado, nunca em texto puro) e a futura
 * rota de revelar credencial pro helper local do Selenium.
 *
 * A CHAVE (`PRICE_CREDENCIAIS_CHAVE`, `server/config.cjs`) mora só no `.env`
 * da máquina servidora — nunca no banco, nunca no código. Sem ela, cifrar e
 * decifrar falham explícito: não existe um modo "sem proteção" silencioso.
 *
 * GCM (não CBC) de propósito: autentica o texto cifrado — se alguém editar a
 * célula da planilha à mão (ou corromper), `decifrar` detecta e erra, em vez
 * de devolver lixo como se fosse uma senha válida.
 */
const crypto = require('crypto');
const { PRICE_CREDENCIAIS_CHAVE } = require('./config.cjs');

const ALGORITMO = 'aes-256-gcm';
const TAMANHO_CHAVE = 32; // AES-256
const TAMANHO_IV = 12; // recomendado pro GCM

/** Deriva uma chave de 32 bytes a partir do texto do `.env` (aceita qualquer
 *  tamanho de entrada — scrypt normaliza) — evita exigir que o usuário monte
 *  uma chave hex/base64 exata de 32 bytes na mão. `salt` fixo é aceitável
 *  aqui: o segredo real é o texto da env, não o salt, e uma única chave serve
 *  pra todo o banco (não é senha de usuário, não precisa de salt por registro). */
function derivarChave() {
  if (!PRICE_CREDENCIAIS_CHAVE) {
    throw new Error('PRICE_CREDENCIAIS_CHAVE não configurada no .env desta máquina — não é possível cifrar/decifrar credencial do Price.');
  }
  return crypto.scryptSync(PRICE_CREDENCIAIS_CHAVE, 'carteira-price-credenciais', TAMANHO_CHAVE);
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
