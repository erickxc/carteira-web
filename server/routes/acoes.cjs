const express = require('express');
const { repoPlanilha } = require('../dominio/repo.cjs');
const { validar, acaoCreateSchema, acaoUpdateSchema } = require('../validation.cjs');
const { isClient } = require('../modo.cjs');
const { aplicarOverlay } = require('../fila/pendentes.cjs');
const { executarMutacao } = require('../fila/mutacao.cjs');

const router = express.Router();
const repo = repoPlanilha();

// --- Ações (recomendações tratadas: programado/concluído/dispensado) ---
router.get('/', (req, res) => {
  const dados = repo.get('Acoes');
  res.json(isClient ? aplicarOverlay('Acoes', dados) : dados);
});

router.post('/', validar(acaoCreateSchema), (req, res) => {
  res.json(executarMutacao('acoes', 'create', { payload: req.body }));
});

router.put('/:id', validar(acaoUpdateSchema), (req, res) => {
  const updated = executarMutacao('acoes', 'update', { id: req.params.id, patch: req.body });
  if (!updated) return res.status(404).json({ error: 'Ação não encontrada.' });
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const found = executarMutacao('acoes', 'delete', { id: req.params.id });
  if (!found) return res.status(404).json({ error: 'Ação não encontrada.' });
  res.json({ success: true });
});

module.exports = router;
