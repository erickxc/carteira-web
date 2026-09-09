const express = require('express');
const { repoPlanilha } = require('../dominio/repo.cjs');
const iniciativasDominio = require('../dominio/agilIniciativas.cjs');
const { validar, validarLote, agilIniciativaCreateSchema, agilIniciativaUpdateSchema, agilReorderIniciativaItemSchema } = require('../validation.cjs');
const { isClient } = require('../modo.cjs');
const { aplicarOverlay } = require('../fila/pendentes.cjs');
const { executarMutacao } = require('../fila/mutacao.cjs');

const router = express.Router();
const repo = repoPlanilha();

router.get('/', (req, res) => {
  const dados = repo.get('AgilIniciativas');
  res.json(isClient ? aplicarOverlay('AgilIniciativas', dados) : dados);
});

router.post('/', validar(agilIniciativaCreateSchema), (req, res) => {
  res.json(executarMutacao('agilIniciativas', 'create', { payload: req.body }));
});

// Precisa vir antes de '/:id' — senão o Express tentaria casar "reorder" como id.
router.put('/reorder', validarLote(agilReorderIniciativaItemSchema), (req, res) => {
  if (!isClient) return res.json(iniciativasDominio.reordenar(repo, req.body));
  res.json(req.body.map((item) => executarMutacao('agilIniciativas', 'update', { id: item.id, patch: { ordem: item.ordem } })));
});

router.put('/:id', validar(agilIniciativaUpdateSchema), (req, res) => {
  const updated = executarMutacao('agilIniciativas', 'update', { id: req.params.id, patch: req.body });
  if (!updated) return res.status(404).json({ error: 'Iniciativa não encontrada.' });
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const found = executarMutacao('agilIniciativas', 'delete', { id: req.params.id });
  if (!found) return res.status(404).json({ error: 'Iniciativa não encontrada.' });
  res.json({ success: true });
});

module.exports = router;
