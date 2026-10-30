/**
 * Situação do CNPJ na Receita, via BrasilAPI (pública, sem credencial).
 * Sem `User-Agent` a API responde 403. Devolve `null` em qualquer falha: quem
 * chama mantém o valor anterior — a Receita é informativa, nunca derruba a
 * rotina do retrato (`retratoProdutos.cjs`).
 */
const TENTATIVAS = 5;
const ESPERA_429_MS = 5000;
const TIMEOUT_MS = 15000;

const dormir = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/** `buscar`/`esperar` injetáveis: teste nunca fala com a BrasilAPI de verdade. */
async function consultarSituacao(cnpj, { buscar = fetch, esperar = dormir } = {}) {
  try {
    for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
      const res = await buscar(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 Carteira2D' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 429) {
        if (tentativa < TENTATIVAS) await esperar(ESPERA_429_MS);
        continue;
      }
      if (!res.ok) return null;
      const dados = await res.json();
      if (!dados.descricao_situacao_cadastral) return null;
      return { situacao: dados.descricao_situacao_cadastral, desde: dados.data_situacao_cadastral || null };
    }
    return null;
  } catch {
    return null;
  }
}

module.exports = { consultarSituacao };
