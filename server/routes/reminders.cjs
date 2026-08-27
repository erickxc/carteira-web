const express = require('express');
const { repoPlanilha } = require('../dominio/repo.cjs');
const { validar, lembreteCreateSchema, lembreteUpdateSchema } = require('../validation.cjs');
const { isClient } = require('../modo.cjs');
const { aplicarOverlay } = require('../fila/pendentes.cjs');
const { executarMutacao } = require('../fila/mutacao.cjs');

const router = express.Router();
const repo = repoPlanilha();

router.get('/', (req, res) => {
  const dados = repo.get('Lembretes');
  res.json(isClient ? aplicarOverlay('Lembretes', dados) : dados);
});

router.post('/', validar(lembreteCreateSchema), (req, res) => {
  res.json(executarMutacao('lembretes', 'create', { payload: req.body }));
});

router.put('/:id', validar(lembreteUpdateSchema), (req, res) => {
  const updated = executarMutacao('lembretes', 'update', { id: req.params.id, patch: req.body });
  if (!updated) return res.status(404).json({ error: 'Lembrete não encontrado.' });
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const found = executarMutacao('lembretes', 'delete', { id: req.params.id });
  if (!found) return res.status(404).json({ error: 'Lembrete não encontrado.' });
  res.json({ success: true });
});

module.exports = router;
