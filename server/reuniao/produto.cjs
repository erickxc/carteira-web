// Investigação de produto (monitorIA na reunião): roda investigar_produto.py no
// ambiente Python do motor de transcrição (DuckDB) e devolve o JSON. Só leitura.
const { execFile } = require('child_process');
const path = require('path');
const { pythonDoMotor } = require('./motor.cjs');

const SCRIPT = path.join(__dirname, 'produto', 'investigar_produto.py');

function rodarInvestigacao({ alvos, dw = '', empresa, produto, fim = '', reajustar = [] }) {
  const args = [SCRIPT, '--alvos', alvos, '--dw', dw, '--empresa', empresa, '--produto', produto, '--reajustar', JSON.stringify(reajustar)];
  if (fim) args.push('--fim', fim);
  return new Promise((ok, falha) => {
    execFile(pythonDoMotor(), args, { env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) return falha(new Error(`investigar_produto: ${String(stderr || err.message).trim().split('\n').pop()}`));
        try { ok(JSON.parse(stdout)); } catch { falha(new Error('investigar_produto: saída não é JSON.')); }
      });
  });
}

/**
 * Investiga um produto para um cliente da Carteira: acha a rede (vínculo do Alvos), roda a
 * consulta e monta os popups (venda, estoque, promoção) do dado. Sem vínculo: erro claro.
 */
async function investigarProduto({ repo, clientId, produto }) {
  const { ALVOS_DIR, DW_DIR } = require('../config.cjs');
  const { contextoDaRede, produtosAReajustar } = require('./rede.cjs');
  const { montarPopups } = require('./popups.cjs');
  const rede = contextoDaRede(clientId, { vinculos: require('../alvos/mapa.cjs').carregar(), clientes: repo.get('Clientes') });
  if (!rede) throw new Error('Este cliente não tem lojas vinculadas aos Dados Alvos.');
  const resultado = await rodarInvestigacao({
    alvos: path.join(ALVOS_DIR, rede.empresa), dw: path.join(DW_DIR, rede.empresa, 'BI'),
    empresa: rede.empresa, produto, reajustar: produtosAReajustar(rede.empresa),
  });
  return { resultado, popups: montarPopups(resultado, { nomesLoja: rede.nomesLoja, cliente: rede.cliente }) };
}

module.exports = { rodarInvestigacao, investigarProduto };
