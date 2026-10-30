const crypto = require('crypto');
const { listaJSON } = require('../../shared/cadenciaServico.cjs');
const { renomearProduto } = require('../../shared/produtos.cjs');

/**
 * Log de mudanças de FASE dos produtos do cliente (`ProdutosHistorico`). Mesmo
 * desenho do `StatusHistorico` (ver `statusHistorico.cjs`): varredura completa
 * de `Clientes` × última linha de cada cliente+produto, gravando só o que
 * mudou — cobre rota, fila, `/bulk` e sincronização sem gancho em cada um.
 * Existe pra `clientesEm` (Visão Geral de meses passados) usar os produtos da
 * ÉPOCA: cancelar um produto hoje não pode tirá-lo dos meses em que estava Ativo.
 *
 * Linha-base usa `faseDesde` do produto (senão `createdAt` do cliente).
 * Cliente sem `produtos` (ainda não migrado) fica de fora: o que se montaria
 * do formato antigo é suposição, e `clientesEm` já usa os `servicos` de hoje
 * pra quem não tem linha. A migração (1.7) grava a linha-base de todos.
 * Só o servidor escreve (fora da fila).
 */
const DESDE_SEMPRE = '1970-01-01T00:00:00.000Z';

const chave = (clientId, produto) => `${clientId}|${renomearProduto(produto)}`;

function sincronizar(repo, agora = new Date()) {
  const clientes = repo.get('Clientes');
  const historico = repo.get('ProdutosHistorico');

  const ultimo = new Map();
  for (const h of historico) {
    const k = chave(h.clientId, h.produto);
    const atual = ultimo.get(k);
    if (!atual || h.mudouEm > atual.mudouEm) ultimo.set(k, h);
  }

  const novos = [];
  for (const c of clientes) {
    if (c.produtos == null || c.produtos === '') continue;
    for (const p of listaJSON(c.produtos)) {
      if (!p || !p.produto) continue;
      const u = ultimo.get(chave(c.id, p.produto));
      if (u && u.fase === p.fase) continue;
      novos.push({
        id: crypto.randomUUID(),
        clientId: c.id,
        produto: renomearProduto(p.produto),
        fase: p.fase ?? '',
        motivo: p.motivoFase ?? '',
        mudouEm: u ? agora.toISOString() : (p.faseDesde || c.createdAt || DESDE_SEMPRE),
        gravadoEm: agora.toISOString(),
      });
    }
  }
  if (novos.length) repo.save('ProdutosHistorico', [...historico, ...novos]);
  return novos.length;
}

function sincronizarSemQuebrar(repo, origem) {
  try {
    const n = sincronizar(repo);
    if (n) console.log(`ProdutosHistorico (${origem}): ${n} registro(s).`);
  } catch (err) {
    console.warn(`Falha ao sincronizar ProdutosHistorico (${origem}):`, err.message);
  }
}

module.exports = { sincronizar, sincronizarSemQuebrar };
