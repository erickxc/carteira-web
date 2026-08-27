const express = require('express');
const { repoPlanilha } = require('../dominio/repo.cjs');
const workspacesDominio = require('../dominio/agilWorkspaces.cjs');
const { validar, validarLote, agilWorkspaceCreateSchema, agilWorkspaceUpdateSchema, agilReorderWorkspaceItemSchema } = require('../validation.cjs');

const router = express.Router();
const repo = repoPlanilha();

router.get('/', (req, res) => {
  res.json(repo.get('AgilWorkspaces'));
});

router.post('/', validar(agilWorkspaceCreateSchema), (req, res) => {
  res.json(workspacesDominio.criar(repo, req.body));
});

// Precisa vir antes de '/:id' — senão o Express tentaria casar "reorder" como id.
router.put('/reorder', validarLote(agilReorderWorkspaceItemSchema), (req, res) => {
  res.json(workspacesDominio.reordenar(repo, req.body));
});

router.put('/:id', validar(agilWorkspaceUpdateSchema), (req, res) => {
  const updated = workspacesDominio.atualizar(repo, req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Área de trabalho não encontrada.' });
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const found = workspacesDominio.remover(repo, req.params.id);
  if (!found) return res.status(404).json({ error: 'Área de trabalho não encontrada.' });
  res.json({ success: true });
});

module.exports = router;
