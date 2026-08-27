const express = require('express');
const { repoPlanilha } = require('../dominio/repo.cjs');
const { validar, modeloCreateSchema, modeloUpdateSchema } = require('../validation.cjs');
const { isClient } = require('../modo.cjs');
const { aplicarOverlay } = require('../fila/pendentes.cjs');
const { executarMutacao } = require('../fila/mutacao.cjs');

const router = express.Router();
const repo = repoPlanilha();

// --- Modelos/materiais por segmento ---
router.get('/', (req, res) => {
  const dados = repo.get('Modelos');
  res.json(isClient ? aplicarOverlay('Modelos', dados) : dados);
});

router.post('/', validar(modeloCreateSchema), (req, res) => {
  res.json(executarMutacao('modelos', 'create', { payload: req.body }));
});

router.put('/:id', validar(modeloUpdateSchema), (req, res) => {
  const updated = executarMutacao('modelos', 'update', { id: req.params.id, patch: req.body });
  if (!updated) return res.status(404).json({ error: 'Modelo não encontrado.' });
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const found = executarMutacao('modelos', 'delete', { id: req.params.id });
  if (!found) return res.status(404).json({ error: 'Modelo não encontrado.' });
  res.json({ success: true });
});

module.exports = router;
