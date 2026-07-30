const crypto = require('crypto');
const { getSheetData, saveSheetData } = require('./db.cjs');
const { calcularProximaDataRelatorio } = require('./cadenciaRelatorio.cjs');
const { gravarReuniaoJson } = require('./reunioesJson.cjs');

const isStatusAtivo = (status) => /^ativ/i.test(String(status || '').trim());
const naoCancelado = (a) => !/cancel|reagend/i.test(a.status || '');

function parseCadencia(raw) {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return null;
}

function criarEventoRelatorio(cliente, data) {
  const agora = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    createdAt: agora,
    clientId: cliente.id,
    clientName: cliente.empresa,
    type: 'Relatório',
    subject: '',
    date: data.toISOString(),
    time: '',
    description: '',
    status: 'Agendado',
    monitor: cliente.monitor || undefined,
    servicos: JSON.stringify([]),
    checklist: JSON.stringify([]),
    preAnalise: JSON.stringify({ orientacoes: [], clientesGeral: '', produtosGeral: '' }),
    ata: '',
    resumo: '',
    attachments: JSON.stringify([]),
  };
}

/**
 * Garante, por cliente com `relatorioCadencia` configurada, que sempre existe
 * no máximo 1 relatório futuro pendente na agenda — gera o próximo quando não
 * há nenhum. Chamada pelo cron semanal (sexta-feira), 1x no boot do servidor,
 * e sob demanda logo após salvar um cliente com cadência nova/alterada
 * (`opts.apenasClientId`, pra refletir a mudança na agenda imediatamente).
 * Erros por cliente são isolados (logados, não interrompem os demais).
 */
function gerarRelatoriosPendentes(opts) {
  const apenasClientId = opts && opts.apenasClientId;
  const clientes = getSheetData('Clientes');
  const agenda = getSheetData('Agenda');
  const now = new Date();
  let criados = 0;

  for (const cliente of clientes) {
    try {
      if (apenasClientId && String(cliente.id) !== String(apenasClientId)) continue;
      if (cliente.atendidoMarco === true || cliente.atendidoMarco === 'true') continue;
      if (!isStatusAtivo(cliente.status)) continue;

      const cadencia = parseCadencia(cliente.relatorioCadencia);
      if (!cadencia || !cadencia.unidade || !cadencia.numero) continue;

      const eventosCliente = agenda.filter((a) => String(a.clientId) === String(cliente.id) && a.type === 'Relatório');
      const temFuturoPendente = eventosCliente.some((a) => naoCancelado(a) && new Date(a.date) > now);
      if (temFuturoPendente) continue;

      let ultimoRelatorio = null;
      for (const a of eventosCliente) {
        if (!naoCancelado(a)) continue;
        const d = new Date(a.date);
        if (isNaN(d.getTime()) || d > now) continue;
        if (!ultimoRelatorio || d > ultimoRelatorio) ultimoRelatorio = d;
      }
      const referencia = ultimoRelatorio || now;
      const proximaData = calcularProximaDataRelatorio(cadencia, referencia);

      const novoEvento = criarEventoRelatorio(cliente, proximaData);
      agenda.push(novoEvento);
      gravarReuniaoJson(novoEvento);
      criados++;
    } catch (err) {
      console.warn(`gerarRelatoriosPendentes: falha para o cliente "${cliente && cliente.empresa}":`, err.message);
    }
  }

  if (criados > 0) saveSheetData('Agenda', agenda);
  return criados;
}

module.exports = { gerarRelatoriosPendentes };
