const express = require('express');
const crypto = require('crypto');
const { getSheetData, saveSheetData, updateSheetRow, deleteSheetRow, syncClienteColumns } = require('../db.cjs');
const { validar, validarLote, clienteCreateSchema, clienteUpdateSchema, clienteBulkItemSchema } = require('../validation.cjs');
const { gerarRelatoriosPendentes } = require('../relatoriosAutomaticos.cjs');

const router = express.Router();

// Gera o próximo relatório na hora quando o cliente salvo já vem com cadência
// configurada — sem isso, a agenda só refletiria a mudança na próxima
// sexta-feira (cron). Erro aqui não deve derrubar a resposta ao cliente.
function gerarRelatorioSeConfigurado(clientId, relatorioCadencia) {
  if (!relatorioCadencia) return;
  try {
    gerarRelatoriosPendentes({ apenasClientId: clientId });
  } catch (err) {
    console.warn(`Falha ao gerar relatório automático para o cliente ${clientId}:`, err.message);
  }
}

router.get('/', (req, res) => {
  res.json(getSheetData('Clientes'));
});

router.post('/', validar(clienteCreateSchema), (req, res) => {
  const data = getSheetData('Clientes');
  // id gerado aqui, não confiado do cliente (o frontend já usa a resposta desta
  // rota, não o id que ele mesmo enviou, para popular o estado local — troca
  // segura, sem mudança de contrato). O create em lote abaixo é a exceção: ainda
  // confia no id do cliente, pois o caller (criarClientesEmLote) usa os ids que
  // ele mesmo gerou para popular o estado local sem reler a resposta — mudar
  // exigiria também mudar esse contrato, fora do escopo desta correção pontual.
  const newClient = syncClienteColumns({ ...req.body, id: crypto.randomUUID() });
  data.push(newClient);
  saveSheetData('Clientes', data);
  gerarRelatorioSeConfigurado(newClient.id, newClient.relatorioCadencia);
  res.json(newClient);
});

router.post('/bulk', validarLote(clienteBulkItemSchema), (req, res) => {
  const data = getSheetData('Clientes');
  const newClients = req.body.map(syncClienteColumns); // Array of clients
  const updatedData = [...data, ...newClients];
  saveSheetData('Clientes', updatedData);
  newClients.forEach((c) => gerarRelatorioSeConfigurado(c.id, c.relatorioCadencia));
  res.json({ success: true, count: newClients.length });
});

router.put('/:id', validar(clienteUpdateSchema), (req, res) => {
  const updated = updateSheetRow('Clientes', req.params.id, req.body, syncClienteColumns);
  if (!updated) return res.status(404).json({ error: 'Cliente não encontrado.' });
  if ('relatorioCadencia' in req.body) gerarRelatorioSeConfigurado(req.params.id, updated.relatorioCadencia);
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  const found = deleteSheetRow('Clientes', req.params.id);
  if (!found) return res.status(404).json({ error: 'Cliente não encontrado.' });

  // Cascade delete: agenda, lembretes e ações vinculados a este cliente
  // (antes só cascateava para Agenda — Lembretes/Acoes ficavam órfãos).
  const agendaRestante = getSheetData('Agenda').filter(a => String(a.clientId) !== String(req.params.id));
  saveSheetData('Agenda', agendaRestante);
  const lembretesRestantes = getSheetData('Lembretes').filter(r => String(r.clientId) !== String(req.params.id));
  saveSheetData('Lembretes', lembretesRestantes);
  const acoesRestantes = getSheetData('Acoes').filter(a => String(a.clientId) !== String(req.params.id));
  saveSheetData('Acoes', acoesRestantes);

  res.json({ success: true });
});

module.exports = router;
