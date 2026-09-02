const express = require('express');
const { repoPlanilha } = require('../dominio/repo.cjs');
const frentesDominio = require('../dominio/agilFrentes.cjs');
const { validar, validarLote, agilFrenteCreateSchema, agilFrenteUpdateSchema, agilReorderFrenteItemSchema } = require('../validation.cjs');
const { isClient } = require('../modo.cjs');
const { aplicarOverlay } = require('../fila/pendentes.cjs');
const { executarMutacao } = require('../fila/mutacao.cjs');

const router = express.Router();
const repo = repoPlanilha();

router.get('/', (req, res) => {
  const dados = repo.get('AgilFrentes');
  res.json(isClient ? aplicarOverlay('AgilFrentes', dados) : dados);
});

router.post('/', validar(agilFrenteCreateSchema), (req, res) => {
  res.json(executarMutacao('agilFrentes', 'create', { payload: req.body }));
});

// Precisa vir antes de '/:id' — senão o Express tentaria casar "reorder" como id.
router.put('/reorder', validarLote(agilReorderFrenteItemSchema), (req, res) => {
  if (!isClient) return res.json(frentesDominio.reordenar(repo, req.body));
  res.json(req.body.map((item) => executarMutacao('agilFrentes', 'update', { id: item.id, patch: { ordem: item.ordem } })));
});

router.put('/:id', validar(agilFrenteUpdateSchema), (req, res) => {
  const updated = executarMutacao('agilFrentes', 'update', { id: req.params.id, patch: req.body });
  if (!updated) return res.status(404).json({ error: 'Frente não encontrada.' });
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const found = executarMutacao('agilFrentes', 'delete', { id: req.params.id });
  if (!found) return res.status(404).json({ error: 'Frente não encontrada.' });
  res.json({ success: true });
});

module.exports = router;
