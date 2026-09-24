const crypto = require('crypto');

/**
 * Log de mudanças de situação do cliente (`StatusHistorico`): só grava quando
 * `status`/`estado`/`pausadoAte` de um cliente difere da última linha dele —
 * mais uma linha-base quando o cliente ainda não tem nenhuma. Serve pra
 * responder "quem estava ativo em julho?" sem depender do cadastro de hoje.
 *
 * Idempotente e de varredura completa (diff de `Clientes` × último registro),
 * de propósito: assim cobre TODO caminho que grava cliente (rotas, fila,
 * `/bulk`, sincronização do Price) sem precisar de gancho em cada um — o
 * domínio chama após gravar (horário exato) e o boot/cron diário é a rede de
 * segurança pros demais caminhos.
 *
 * Linha-base usa `createdAt` do cliente (não "agora"): o cliente passa a
 * existir nos meses certos. Legado sem `createdAt` vale desde sempre.
 * Limite conhecido: mudanças anteriores a este log não existem — meses
 * passados refletem a situação de quando o log começou.
 */
const CAMPOS = ['status', 'estado', 'pausadoAte'];
const DESDE_SEMPRE = '1970-01-01T00:00:00.000Z';

const assinatura = (o) => CAMPOS.map((c) => String(o[c] ?? '')).join('|');

function sincronizar(repo, agora = new Date()) {
  const clientes = repo.get('Clientes');
  const historico = repo.get('StatusHistorico');

  const ultimo = new Map();
  for (const h of historico) {
    const atual = ultimo.get(h.clientId);
    if (!atual || h.mudouEm > atual.mudouEm) ultimo.set(h.clientId, h);
  }

  const novos = [];
  for (const c of clientes) {
    const u = ultimo.get(c.id);
    if (u && assinatura(u) === assinatura(c)) continue;
    novos.push({
      id: crypto.randomUUID(),
      clientId: c.id,
      status: c.status ?? '',
      estado: c.estado ?? '',
      pausadoAte: c.pausadoAte ?? '',
      mudouEm: u ? agora.toISOString() : (c.createdAt || DESDE_SEMPRE),
    });
  }
  if (novos.length) repo.save('StatusHistorico', [...historico, ...novos]);
  return novos.length;
}

function sincronizarSemQuebrar(repo, origem) {
  try {
    const n = sincronizar(repo);
    if (n) console.log(`StatusHistorico (${origem}): ${n} registro(s).`);
  } catch (err) {
    console.warn(`Falha ao sincronizar StatusHistorico (${origem}):`, err.message);
  }
}

module.exports = { sincronizar, sincronizarSemQuebrar };
