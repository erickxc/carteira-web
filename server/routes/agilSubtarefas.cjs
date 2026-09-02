const express = require('express');
const { repoPlanilha } = require('../dominio/repo.cjs');
const { validar, agilSubtarefaCreateSchema, agilSubtarefaUpdateSchema } = require('../validation.cjs');
const { isClient } = require('../modo.cjs');
const { aplicarOverlay } = require('../fila/pendentes.cjs');
const { executarMutacao } = require('../fila/mutacao.cjs');

const router = express.Router();
const repo = repoPlanilha();

router.get('/', (req, res) => {
  const dados = repo.get('AgilSubtarefas');
  res.json(isClient ? aplicarOverlay('AgilSubtarefas', dados) : dados);
});

router.post('/', validar(agilSubtarefaCreateSchema), (req, res) => {
  res.json(executarMutacao('agilSubtarefas', 'create', { payload: req.body }));
});

router.put('/:id', validar(agilSubtarefaUpdateSchema), (req, res) => {
  const updated = executarMutacao('agilSubtarefas', 'update', { id: req.params.id, patch: req.body });
  if (!updated) return res.status(404).json({ error: 'Subtarefa não encontrada.' });
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const found = executarMutacao('agilSubtarefas', 'delete', { id: req.params.id });
  if (!found) return res.status(404).json({ error: 'Subtarefa não encontrada.' });
  res.json({ success: true });
});

module.exports = router;
