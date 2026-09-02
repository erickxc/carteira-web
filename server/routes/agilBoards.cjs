const express = require('express');
const { repoPlanilha } = require('../dominio/repo.cjs');
const { validar, agilBoardCreateSchema, agilBoardUpdateSchema } = require('../validation.cjs');
const { isClient } = require('../modo.cjs');
const { aplicarOverlay } = require('../fila/pendentes.cjs');
const { executarMutacao } = require('../fila/mutacao.cjs');

const router = express.Router();
const repo = repoPlanilha();

router.get('/', (req, res) => {
  const dados = repo.get('AgilBoards');
  res.json(isClient ? aplicarOverlay('AgilBoards', dados) : dados);
});

router.post('/', validar(agilBoardCreateSchema), (req, res) => {
  res.json(executarMutacao('agilBoards', 'create', { payload: req.body }));
});

router.put('/:id', validar(agilBoardUpdateSchema), (req, res) => {
  const updated = executarMutacao('agilBoards', 'update', { id: req.params.id, patch: req.body });
  if (!updated) return res.status(404).json({ error: 'Board não encontrado.' });
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const found = executarMutacao('agilBoards', 'delete', { id: req.params.id });
  if (!found) return res.status(404).json({ error: 'Board não encontrado.' });
  res.json({ success: true });
});

module.exports = router;
