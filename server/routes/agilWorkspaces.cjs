const express = require('express');
const { repoPlanilha } = require('../dominio/repo.cjs');
const workspacesDominio = require('../dominio/agilWorkspaces.cjs');
const { validar, validarLote, agilWorkspaceCreateSchema, agilWorkspaceUpdateSchema, agilReorderWorkspaceItemSchema } = require('../validation.cjs');
const { isClient } = require('../modo.cjs');
const { aplicarOverlay } = require('../fila/pendentes.cjs');
const { executarMutacao } = require('../fila/mutacao.cjs');

const router = express.Router();
const repo = repoPlanilha();

router.get('/', (req, res) => {
  const dados = repo.get('AgilWorkspaces');
  res.json(isClient ? aplicarOverlay('AgilWorkspaces', dados) : dados);
});

router.post('/', validar(agilWorkspaceCreateSchema), (req, res) => {
  res.json(executarMutacao('agilWorkspaces', 'create', { payload: req.body }));
});

// Precisa vir antes de '/:id' — senão o Express tentaria casar "reorder" como id.
router.put('/reorder', validarLote(agilReorderWorkspaceItemSchema), (req, res) => {
  if (!isClient) return res.json(workspacesDominio.reordenar(repo, req.body));
  res.json(req.body.map((item) => executarMutacao('agilWorkspaces', 'update', { id: item.id, patch: { ordem: item.ordem } })));
});

router.put('/:id', validar(agilWorkspaceUpdateSchema), (req, res) => {
  const updated = executarMutacao('agilWorkspaces', 'update', { id: req.params.id, patch: req.body });
  if (!updated) return res.status(404).json({ error: 'Área de trabalho não encontrada.' });
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const found = executarMutacao('agilWorkspaces', 'delete', { id: req.params.id });
  if (!found) return res.status(404).json({ error: 'Área de trabalho não encontrada.' });
  res.json({ success: true });
});

module.exports = router;
