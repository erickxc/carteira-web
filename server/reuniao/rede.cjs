// Liga um cliente da Carteira à rede dele nas fontes da 2D: a pasta da empresa (vínculo do
// Dados Alvos: empresa -> { loja: clientId }), o nome amigável de cada loja e o que o
// analisador do Ecossistema manda reajustar (fica fora da sugestão de promoção).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function contextoDaRede(clientId, { vinculos, clientes }) {
  const empresa = Object.keys(vinculos || {}).find((e) => Object.values(vinculos[e] || {}).some((id) => String(id) === String(clientId)));
  if (!empresa) return null;
  const lojas = vinculos[empresa];
  const nomePorId = new Map((clientes || []).map((c) => [String(c.id), String(c.empresa ?? '')]));
  const nomes = Object.fromEntries(Object.entries(lojas).map(([loja, id]) => [loja, nomePorId.get(String(id)) || loja]));
  // "Pecita - Campo Grande", "Pecita - Itaguaí" -> "Campo Grande", "Itaguaí": tira o prefixo da rede.
  const prefixos = Object.values(nomes).map((n) => (n.includes(' - ') ? n.split(' - ')[0] : null));
  const comum = prefixos.length > 1 && prefixos.every((p) => p && p === prefixos[0]) ? `${prefixos[0]} - ` : null;
  const nomesLoja = Object.fromEntries(Object.entries(nomes).map(([l, n]) => [l, comum ? n.slice(comum.length) : n]));
  return { empresa, cliente: nomePorId.get(String(clientId)) || '', nomesLoja };
}

function produtosAReajustar(empresa, raiz = require('../config.cjs').ANALISADOR_DIR) {
  try {
    const dir = path.join(raiz, empresa, '_cache_telas');
    const maisNovo = fs.readdirSync(dir).filter((f) => f.startsWith('a-precificar-') && f.endsWith('.json.gz'))
      .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t)[0];
    if (!maisNovo) return [];
    const dados = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, maisNovo.f))));
    return (dados?.resultado?.produtos || []).filter((p) => Number(p.reajuste) > 0).map((p) => p.descricao);
  } catch {
    return []; // cartão ausente ou em outro formato: só não exclui nada da promoção
  }
}

module.exports = { contextoDaRede, produtosAReajustar };
