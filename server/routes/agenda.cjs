const express = require('express');
const { repoPlanilha } = require('../dominio/repo.cjs');
const { validar, validarLote, agendaCreateSchema, agendaUpdateSchema, agendaBulkItemSchema } = require('../validation.cjs');
const { gravarReuniaoJson, REUNIOES_DIR } = require('../reunioesJson.cjs');
const { isClient } = require('../modo.cjs');
const { aplicarOverlay } = require('../fila/pendentes.cjs');
const { executarMutacao } = require('../fila/mutacao.cjs');
const { dispararPosEvento } = require('../ia/posEvento.cjs');

const router = express.Router();
const repo = repoPlanilha();

router.get('/', (req, res) => {
  const dados = repo.get('Agenda');
  res.json(isClient ? aplicarOverlay('Agenda', dados) : dados);
});

router.post('/', validar(agendaCreateSchema), (req, res) => {
  const criado = executarMutacao('agenda', 'create', { payload: req.body });
  res.json(criado);
  dispararPosEvento(repo, criado?.clientId, criado?.status);
});

// Bulk (série recorrente antiga) e o backfill de export-json não passam pela
// fila — mesma exceção documentada em clients.cjs; bloqueados em modo cliente
// pela guarda de escrita em dbSqlite.cjs.
router.post('/bulk', validarLote(agendaBulkItemSchema), (req, res) => {
  const data = repo.get('Agenda');
  const newItems = req.body;
  repo.save('Agenda', [...data, ...newItems]);
  newItems.forEach(gravarReuniaoJson);
  res.json({ success: true, count: newItems.length });
});

router.post('/export-json', (req, res) => {
  const data = repo.get('Agenda');
  data.forEach(gravarReuniaoJson);
  res.json({ success: true, count: data.length, pasta: REUNIOES_DIR });
});

router.put('/:id', validar(agendaUpdateSchema), (req, res) => {
  const updated = executarMutacao('agenda', 'update', { id: req.params.id, patch: req.body });
  if (!updated) return res.status(404).json({ error: 'Evento não encontrado.' });
  res.json(updated);
  // Dossiê + catálogo em segundo plano (ver `ia/posEvento.cjs`): responde
  // primeiro, atualiza depois — a tela não espera.
  dispararPosEvento(repo, updated.clientId, updated.status);
});

router.delete('/:id', (req, res) => {
  const found = executarMutacao('agenda', 'delete', { id: req.params.id });
  if (!found) return res.status(404).json({ error: 'Evento não encontrado.' });
  res.json({ success: true });
});

module.exports = router;
