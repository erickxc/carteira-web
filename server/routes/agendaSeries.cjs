const express = require('express');
const { repoPlanilha } = require('../dominio/repo.cjs');
const { isClient } = require('../modo.cjs');
const { aplicarOverlay } = require('../fila/pendentes.cjs');
const { executarMutacao } = require('../fila/mutacao.cjs');
const { datasNoIntervalo, parseDataLocal } = require('../regraRecorrencia.cjs');
const { validar, agendaSerieCreateSchema, agendaSerieUpdateSchema } = require('../validation.cjs');

const router = express.Router();
const repo = repoPlanilha();

router.get('/', (req, res) => {
  const dados = repo.get('AgendaSeries');
  res.json(isClient ? aplicarOverlay('AgendaSeries', dados) : dados);
});

router.post('/', validar(agendaSerieCreateSchema), (req, res) => {
  res.json(executarMutacao('agendaSeries', 'create', { payload: req.body }));
});

// Preview de datas ANTES de salvar — o formulário mostra "vai criar em: ..."
// sem duplicar a matemática de `regraRecorrencia.cjs` no frontend. Vem antes
// de '/:id' pelo mesmo motivo dos outros módulos (Express casaria "preview"
// como :id).
router.post('/preview', (req, res) => {
  const { regra, inicio } = req.body || {};
  if (!regra || !regra.modo) return res.status(400).json({ error: 'Informe a regra de recorrência.' });
  // `inicio` é "yyyy-MM-dd" (data pura) — nunca `new Date(string)` direto,
  // que interpreta como UTC e volta um dia em fusos negativos (Brasil).
  const de = inicio ? parseDataLocal(inicio) : new Date();
  if (isNaN(de.getTime())) return res.status(400).json({ error: 'Data de início inválida.' });
  // Janela de 3 meses é suficiente pra dar confiança na regra sem gerar uma
  // lista gigante — a criação de verdade é incremental (mês a mês), não em lote.
  const ate = new Date(de.getFullYear(), de.getMonth() + 3, de.getDate());
  const datas = datasNoIntervalo(regra, de, ate);
  res.json({ datas: datas.slice(0, 12).map((d) => d.toISOString()), total: datas.length });
});

router.put('/:id', validar(agendaSerieUpdateSchema), (req, res) => {
  const updated = executarMutacao('agendaSeries', 'update', { id: req.params.id, patch: req.body });
  if (!updated) return res.status(404).json({ error: 'Série não encontrada.' });
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const found = executarMutacao('agendaSeries', 'delete', { id: req.params.id });
  if (!found) return res.status(404).json({ error: 'Série não encontrada.' });
  res.json({ success: true });
});

module.exports = router;
