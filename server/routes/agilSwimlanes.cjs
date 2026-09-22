const express = require('express');
const { repoPlanilha } = require('../dominio/repo.cjs');
const swimlanesDominio = require('../dominio/agilSwimlanes.cjs');
const { validar, validarLote, agilSwimlaneCreateSchema, agilSwimlaneUpdateSchema, agilReorderSwimlaneItemSchema } = require('../validation.cjs');
const { isClient } = require('../modo.cjs');
const { aplicarOverlay } = require('../fila/pendentes.cjs');
const { executarMutacao } = require('../fila/mutacao.cjs');

const router = express.Router();
const repo = repoPlanilha();

router.get('/', (req, res) => {
  const dados = repo.get('AgilSwimlanes');
  res.json(isClient ? aplicarOverlay('AgilSwimlanes', dados) : dados);
});

router.post('/', validar(agilSwimlaneCreateSchema), (req, res) => {
  res.json(executarMutacao('agilSwimlanes', 'create', { payload: req.body }));
});

// Precisa vir antes de '/:id' — senão o Express tentaria casar "reorder" como id.
router.put('/reorder', validarLote(agilReorderSwimlaneItemSchema), (req, res) => {
  if (!isClient) return res.json(swimlanesDominio.reordenar(repo, req.body));
  res.json(req.body.map((item) => executarMutacao('agilSwimlanes', 'update', { id: item.id, patch: { ordem: item.ordem } })));
});

router.put('/:id', validar(agilSwimlaneUpdateSchema), (req, res) => {
  const updated = executarMutacao('agilSwimlanes', 'update', { id: req.params.id, patch: req.body });
  if (!updated) return res.status(404).json({ error: 'Swimlane não encontrada.' });
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const found = executarMutacao('agilSwimlanes', 'delete', { id: req.params.id });
  if (!found) return res.status(404).json({ error: 'Swimlane não encontrada.' });
  res.json({ success: true });
});

module.exports = router;
