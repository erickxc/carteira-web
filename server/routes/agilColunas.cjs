const express = require('express');
const { repoPlanilha } = require('../dominio/repo.cjs');
const colunasDominio = require('../dominio/agilColunas.cjs');
const { validar, validarLote, agilColunaCreateSchema, agilColunaUpdateSchema, agilReorderColunaItemSchema } = require('../validation.cjs');
const { isClient } = require('../modo.cjs');
const { aplicarOverlay } = require('../fila/pendentes.cjs');
const { executarMutacao } = require('../fila/mutacao.cjs');

const router = express.Router();
const repo = repoPlanilha();

router.get('/', (req, res) => {
  const dados = repo.get('AgilColunas');
  res.json(isClient ? aplicarOverlay('AgilColunas', dados) : dados);
});

router.post('/', validar(agilColunaCreateSchema), (req, res) => {
  res.json(executarMutacao('agilColunas', 'create', { payload: req.body }));
});

// Precisa vir antes de '/:id' — senão o Express tentaria casar "reorder" como id.
router.put('/reorder', validarLote(agilReorderColunaItemSchema), (req, res) => {
  if (!isClient) return res.json(colunasDominio.reordenar(repo, req.body));
  res.json(req.body.map((item) => executarMutacao('agilColunas', 'update', { id: item.id, patch: { ordem: item.ordem } })));
});

router.put('/:id', validar(agilColunaUpdateSchema), (req, res) => {
  const updated = executarMutacao('agilColunas', 'update', { id: req.params.id, patch: req.body });
  if (!updated) return res.status(404).json({ error: 'Coluna não encontrada.' });
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const found = executarMutacao('agilColunas', 'delete', { id: req.params.id });
  if (!found) return res.status(404).json({ error: 'Coluna não encontrada.' });
  res.json({ success: true });
});

module.exports = router;
