const express = require('express');
const { repoPlanilha } = require('../dominio/repo.cjs');
const tarefasDominio = require('../dominio/agilTarefas.cjs');
const { validar, validarLote, agilTarefaCreateSchema, agilTarefaUpdateSchema, agilReorderTarefaItemSchema } = require('../validation.cjs');
const { isClient } = require('../modo.cjs');
const { aplicarOverlay } = require('../fila/pendentes.cjs');
const { executarMutacao } = require('../fila/mutacao.cjs');

const router = express.Router();
const repo = repoPlanilha();

router.get('/', (req, res) => {
  const dados = repo.get('AgilTarefas');
  res.json(isClient ? aplicarOverlay('AgilTarefas', dados) : dados);
});

router.post('/', validar(agilTarefaCreateSchema), (req, res) => {
  res.json(executarMutacao('agilTarefas', 'create', { payload: req.body }));
});

// Precisa vir antes de '/:id' — senão o Express tentaria casar "reorder" como id.
// Sem operação genérica de "reorder em lote" na fila: em modo cliente vira uma
// sequência de updates (colunaId/swimlaneId/ordem) por tarefa movida — perde a
// otimização de "um save só" que o modo servidor mantém via `reordenar`, mas
// reaproveita o contrato create/update/delete já existente sem inventar um
// tipo de operação novo pra fila.
router.put('/reorder', validarLote(agilReorderTarefaItemSchema), (req, res) => {
  if (!isClient) return res.json(tarefasDominio.reordenar(repo, req.body));
  res.json(req.body.map((item) => executarMutacao('agilTarefas', 'update', {
    id: item.id,
    patch: { colunaId: item.colunaId, swimlaneId: item.swimlaneId, ordem: item.ordem },
  })));
});

router.put('/:id', validar(agilTarefaUpdateSchema), (req, res) => {
  const updated = executarMutacao('agilTarefas', 'update', { id: req.params.id, patch: req.body });
  if (!updated) return res.status(404).json({ error: 'Tarefa não encontrada.' });
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const found = executarMutacao('agilTarefas', 'delete', { id: req.params.id });
  if (!found) return res.status(404).json({ error: 'Tarefa não encontrada.' });
  res.json({ success: true });
});

module.exports = router;
