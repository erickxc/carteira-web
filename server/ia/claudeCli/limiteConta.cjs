const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { tokenSalvo } = require('./estado.cjs');
const { registrarUso } = require('../uso.cjs');

/**
 * Cota da assinatura (janela de 5h / limite de 7 dias) — a parte que, ao
 * contrário do resto deste módulo, o Claude Code CLI NÃO expõe: inspecionei
 * `~/.claude/debug/<sessão>.txt` de uma chamada real (`claude -p ... --debug`)
 * e nenhuma linha de log carrega essa informação. Mas ela EXISTE: a API real
 * (`POST /v1/messages`) devolve nos HEADERS da resposta de toda chamada —
 * confirmado batendo direto na API com a mesma credencial OAuth que o CLI usa.
 * O CLI só não repassa isso pra fora; ele lê, decide fast-mode e descarta.
 *
 * Por isso este módulo faz uma chamada PRÓPRIA e MÍNIMA (Haiku, `max_tokens: 1`)
 * só pra ler os headers — é uma chamada real e paga (poucos tokens), não uma
 * checagem de graça. TTL de cache alto de propósito (`TTL_MS`) pra não gerar
 * tráfego a cada abertura da tela de Configurações.
 */

const TTL_MS = 5 * 60 * 1000; // 5 min — a janela de 5h não muda rápido o suficiente pra justificar mais.
const URL_MESSAGES = 'https://api.anthropic.com/v1/messages';

let cache = { em: 0, valor: null };

/** Token bearer pra chamar a API direto: o mesmo que o CLI usaria. */
function tokenBearer() {
  const daGui = tokenSalvo();
  if (daGui) return daGui;
  // Sem token da GUI: tenta o login desta MÁQUINA (mesmo arquivo que
  // `claude auth login` escreve — ver docs oficiais, "Credential management").
  // Leitura, nunca escrita: não é este módulo que gerencia essa credencial.
  try {
    const caminho = path.join(os.homedir(), '.claude', '.credentials.json');
    const cred = JSON.parse(fs.readFileSync(caminho, 'utf8'));
    return cred?.claudeAiOauth?.accessToken || null;
  } catch {
    return null;
  }
}

/** `anthropic-ratelimit-unified-5h-utilization: 0.09` -> `{ utilizacao: 0.09 }`, etc. */
function extrairJanela(headers, prefixo) {
  const num = (nome) => {
    const v = headers.get(`anthropic-ratelimit-unified-${prefixo}-${nome}`);
    return v === null ? null : Number(v);
  };
  const utilizacao = num('utilization');
  if (utilizacao === null) return null;
  const resetUnix = num('reset');
  return {
    utilizacao, // 0..1 — fração já usada da janela
    status: headers.get(`anthropic-ratelimit-unified-${prefixo}-status`),
    resetaEm: resetUnix ? new Date(resetUnix * 1000).toISOString() : null,
  };
}

async function consultarLimiteConta({ forcar = false, repo } = {}) {
  if (!forcar && cache.valor && Date.now() - cache.em < TTL_MS) return cache.valor;

  const token = tokenBearer();
  if (!token) {
    const semCredencial = { ok: false, motivo: 'sem-credencial' };
    cache = { em: Date.now(), valor: semCredencial };
    return semCredencial;
  }

  let valor;
  try {
    const resp = await fetch(URL_MESSAGES, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'anthropic-version': '2023-06-01',
        // Obrigatório pra autenticar com token OAuth de assinatura em vez de
        // chave de API — confirmado por tentativa: sem isso a API rejeita o
        // bearer OAuth do CLI.
        'anthropic-beta': 'oauth-2025-04-20',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'oi' }],
      }),
    });

    const corpo = await resp.text().catch(() => '');
    if (!resp.ok) {
      valor = { ok: false, motivo: `api-${resp.status}`, detalhe: corpo.slice(0, 200) };
    } else {
      valor = {
        ok: true,
        cincoHoras: extrairJanela(resp.headers, '5h'),
        seteDias: extrairJanela(resp.headers, '7d'),
        consultadoEm: new Date().toISOString(),
      };
      // Esta checagem é uma chamada REAL e paga (mínima, mas não grátis) — fica
      // registrada no mesmo painel de consumo, com origem própria, pra não
      // aparecer como se fosse uma pergunta do usuário nem ficar invisível.
      if (repo) {
        try {
          const uso = JSON.parse(corpo)?.usage || {};
          registrarUso(repo, {
            origem: 'sonda-cota', provedor: 'claude-cli', modelo: 'claude-haiku-4-5-20251001',
            turnId: crypto.randomUUID(), inputTokens: uso.input_tokens || 0, outputTokens: uso.output_tokens || 0,
            custoUsd: null, duracaoMs: 0, numFerramentas: 0,
          });
        } catch { /* log de transparência é best-effort — não pode derrubar a checagem */ }
      }
    }
  } catch (err) {
    valor = { ok: false, motivo: 'rede', detalhe: err.message };
  }

  cache = { em: Date.now(), valor };
  return valor;
}

function limparCacheLimite() {
  cache = { em: 0, valor: null };
}

module.exports = { consultarLimiteConta, limparCacheLimite, extrairJanela, tokenBearer };
