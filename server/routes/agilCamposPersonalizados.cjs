const express = require('express');
const { repoPlanilha } = require('../dominio/repo.cjs');
const camposDominio = require('../dominio/agilCamposPersonalizados.cjs');
const { validar, validarLote, agilCampoPersonalizadoCreateSchema, agilCampoPersonalizadoUpdateSchema, agilReorderCampoPersonalizadoItemSchema } = require('../validation.cjs');
const { isClient } = require('../modo.cjs');
const { aplicarOverlay } = require('../fila/pendentes.cjs');
const { executarMutacao } = require('../fila/mutacao.cjs');

const router = express.Router();
const repo = repoPlanilha();

router.get('/', (req, res) => {
  const dados = repo.get('AgilCamposPersonalizados');
  res.json(isClient ? aplicarOverlay('AgilCamposPersonalizados', dados) : dados);
});

router.post('/', validar(agilCampoPersonalizadoCreateSchema), (req, res) => {
  res.json(executarMutacao('agilCamposPersonalizados', 'create', { payload: req.body }));
});

// Precisa vir antes de '/:id' — senão o Express tentaria casar "reorder" como id.
router.put('/reorder', validarLote(agilReorderCampoPersonalizadoItemSchema), (req, res) => {
  if (!isClient) return res.json(camposDominio.reordenar(repo, req.body));
  res.json(req.body.map((item) => executarMutacao('agilCamposPersonalizados', 'update', { id: item.id, patch: { ordem: item.ordem } })));
});

router.put('/:id', validar(agilCampoPersonalizadoUpdateSchema), (req, res) => {
  const updated = executarMutacao('agilCamposPersonalizados', 'update', { id: req.params.id, patch: req.body });
  if (!updated) return res.status(404).json({ error: 'Campo personalizado não encontrado.' });
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const found = executarMutacao('agilCamposPersonalizados', 'delete', { id: req.params.id });
  if (!found) return res.status(404).json({ error: 'Campo personalizado não encontrado.' });
  res.json({ success: true });
});

module.exports = router;
