const fs = require('fs');
const path = require('path');
const {
  CLAUDE_STATE_FILE, IA_PROVIDER, IA_PROVIDERS,
  CLAUDE_CLI_MODEL, CLAUDE_CLI_MODEL_PADRAO, CLAUDE_CLI_MODELOS,
} = require('../../config.cjs');

/**
 * Estado local do provedor de IA: qual provedor está ativo e, no caso do
 * Claude CLI, o token OAuth de longa duração gerado por `claude setup-token`.
 *
 * Por que arquivo local e não `.env`: a escolha do provedor e o login são
 * feitos pela GUI (Configurações → monitorIA), e o `.env` de produção vive
 * fora da pasta do app justamente pra sobreviver às atualizações — reescrevê-lo
 * a cada clique seria disputar arquivo com o launcher. Aqui é estado de
 * runtime, escrito só por este processo.
 *
 * Segurança: mora em `SQLITE_DIR` (LOCALAPPDATA), nunca no OneDrive — ver
 * `CLAUDE_STATE_FILE` em `server/config.cjs`. O token é equivalente à conta
 * Claude do usuário por 1 ano; o arquivo é criado com modo 0600 (no Windows a
 * ACL do perfil do usuário é a proteção real, o modo é cosmético lá).
 */

const VAZIO = { provedor: null, token: '', modelo: '', atualizadoEm: null };

function ler() {
  try {
    const bruto = JSON.parse(fs.readFileSync(CLAUDE_STATE_FILE, 'utf8'));
    return {
      provedor: IA_PROVIDERS.includes(bruto.provedor) ? bruto.provedor : null,
      token: typeof bruto.token === 'string' ? bruto.token : '',
      modelo: CLAUDE_CLI_MODELOS.includes(bruto.modelo) ? bruto.modelo : '',
      atualizadoEm: bruto.atualizadoEm ?? null,
    };
  } catch {
    return { ...VAZIO };
  }
}

function escrever(patch) {
  const proximo = { ...ler(), ...patch, atualizadoEm: new Date().toISOString() };
  fs.mkdirSync(path.dirname(CLAUDE_STATE_FILE), { recursive: true });
  fs.writeFileSync(CLAUDE_STATE_FILE, JSON.stringify(proximo, null, 2), { mode: 0o600 });
  return proximo;
}

/**
 * Provedor efetivo. `IA_PROVIDER` no `.env` tem precedência e TRAVA a escolha
 * (deploy controlado: quem definiu no ambiente não quer que um clique na GUI
 * mude). Sem ele, vale o arquivo; sem arquivo, `ollama` — que é o
 * comportamento que já existia antes deste módulo.
 */
function provedorAtivo() {
  if (IA_PROVIDERS.includes(IA_PROVIDER)) return IA_PROVIDER;
  return ler().provedor || 'ollama';
}

const provedorTravado = () => IA_PROVIDERS.includes(IA_PROVIDER);

function definirProvedor(provedor) {
  if (!IA_PROVIDERS.includes(provedor)) throw new Error(`Provedor inválido: "${provedor}".`);
  if (provedorTravado()) throw new Error(`Provedor está fixado em "${IA_PROVIDER}" pelo .env (IA_PROVIDER) — mude lá, não pela interface.`);
  return escrever({ provedor });
}

/**
 * Modelo efetivo do CLI. Mesma precedência do provedor: `.env` manda e trava,
 * senão vale a GUI, senão o padrão.
 */
function modeloAtivo() {
  if (CLAUDE_CLI_MODEL) return CLAUDE_CLI_MODEL;
  return ler().modelo || CLAUDE_CLI_MODEL_PADRAO;
}

const modeloTravado = () => Boolean(CLAUDE_CLI_MODEL);

function definirModelo(modelo) {
  if (!CLAUDE_CLI_MODELOS.includes(modelo)) throw new Error(`Modelo inválido: "${modelo}".`);
  if (modeloTravado()) throw new Error(`Modelo está fixado em "${CLAUDE_CLI_MODEL}" pelo .env (CLAUDE_CLI_MODEL) — mude lá, não pela interface.`);
  return escrever({ modelo });
}

const tokenSalvo = () => ler().token;
const salvarToken = (token) => escrever({ token });
const removerToken = () => escrever({ token: '' });

/**
 * Ambiente das chamadas ao CLI. `CLAUDE_CODE_OAUTH_TOKEN` é a única
 * credencial que passamos — de propósito NÃO herdamos `ANTHROPIC_API_KEY`
 * nem `ANTHROPIC_AUTH_TOKEN` do processo: elas têm precedência sobre o token
 * OAuth na ordem de autenticação do CLI, então uma variável esquecida no
 * ambiente da máquina passaria a cobrar por API paga sem ninguém perceber —
 * exatamente o que este provedor existe pra evitar.
 */
function ambienteCredencial(base = process.env) {
  const env = { ...base };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  delete env.CLAUDE_CODE_USE_BEDROCK;
  delete env.CLAUDE_CODE_USE_VERTEX;
  delete env.CLAUDE_CODE_USE_FOUNDRY;
  const token = tokenSalvo();
  if (token) env.CLAUDE_CODE_OAUTH_TOKEN = token;
  else delete env.CLAUDE_CODE_OAUTH_TOKEN;
  return env;
}

module.exports = {
  ler, escrever, provedorAtivo, provedorTravado, definirProvedor,
  modeloAtivo, modeloTravado, definirModelo,
  tokenSalvo, salvarToken, removerToken, ambienteCredencial,
};
