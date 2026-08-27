const express = require('express');
const { repoPlanilha } = require('../dominio/repo.cjs');
const clientesDominio = require('../dominio/clientes.cjs');
const { syncClienteColumns } = require('../db.cjs');
const { validar, validarLote, clienteCreateSchema, clienteUpdateSchema, clienteBulkItemSchema } = require('../validation.cjs');
const { isClient } = require('../modo.cjs');
const { aplicarOverlay } = require('../fila/pendentes.cjs');
const { executarMutacao } = require('../fila/mutacao.cjs');

const router = express.Router();
const repo = repoPlanilha();

router.get('/', (req, res) => {
  const dados = repo.get('Clientes');
  res.json(isClient ? aplicarOverlay('Clientes', dados) : dados);
});

router.post('/', validar(clienteCreateSchema), (req, res) => {
  res.json(executarMutacao('clientes', 'create', { payload: req.body }));
});

// Bulk (segmentação em várias lojas) ainda não passa pela fila — exceção já
// documentada no plano (confia no id do corpo, usado hoje só pelo modo
// server). Em modo cliente, isso continua bloqueado pela guarda de escrita
// direta em dbSqlite.cjs até essa exceção ser resolvida.
router.post('/bulk', validarLote(clienteBulkItemSchema), (req, res) => {
  const data = repo.get('Clientes');
  const newClients = req.body.map(syncClienteColumns);
  repo.save('Clientes', [...data, ...newClients]);
  newClients.forEach((c) => clientesDominio.gerarRelatorioSeConfigurado(c.id, c.relatorioCadencia));
  res.json({ success: true, count: newClients.length });
});

router.put('/:id', validar(clienteUpdateSchema), (req, res) => {
  const updated = executarMutacao('clientes', 'update', { id: req.params.id, patch: req.body });
  if (!updated) return res.status(404).json({ error: 'Cliente não encontrado.' });
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const found = executarMutacao('clientes', 'delete', { id: req.params.id });
  if (!found) return res.status(404).json({ error: 'Cliente não encontrado.' });
  res.json({ success: true });
});

module.exports = router;
