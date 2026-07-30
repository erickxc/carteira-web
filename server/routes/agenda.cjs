const express = require('express');
const crypto = require('crypto');
const { getSheetData, saveSheetData, updateSheetRow, deleteSheetRow } = require('../db.cjs');
const { validar, validarLote, agendaCreateSchema, agendaUpdateSchema, agendaBulkItemSchema } = require('../validation.cjs');
const { gravarReuniaoJson, removerReuniaoJson, REUNIOES_DIR } = require('../reunioesJson.cjs');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(getSheetData('Agenda'));
});

router.post('/', validar(agendaCreateSchema), (req, res) => {
  const data = getSheetData('Agenda');
  // id gerado aqui (não confiado do cliente) — o frontend já usa a resposta
  // desta rota (não o id que ele mesmo enviou) para popular estado local e
  // encadear ações seguintes (ex.: criar lembrete vinculado ao evento recém-criado).
  const newItem = { ...req.body, id: crypto.randomUUID() };
  data.push(newItem);
  saveSheetData('Agenda', data);
  gravarReuniaoJson(newItem);
  res.json(newItem);
});

router.post('/bulk', validarLote(agendaBulkItemSchema), (req, res) => {
  const data = getSheetData('Agenda');
  const newItems = req.body;
  const updatedData = [...data, ...newItems];
  saveSheetData('Agenda', updatedData);
  newItems.forEach(gravarReuniaoJson);
  res.json({ success: true, count: newItems.length });
});

// Backfill: (re)grava todas as reuniões existentes como JSON na pasta.
router.post('/export-json', (req, res) => {
  const data = getSheetData('Agenda');
  data.forEach(gravarReuniaoJson);
  res.json({ success: true, count: data.length, pasta: REUNIOES_DIR });
});

router.put('/:id', validar(agendaUpdateSchema), (req, res) => {
  const updated = updateSheetRow('Agenda', req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Evento não encontrado.' });
  gravarReuniaoJson(updated);
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  const found = deleteSheetRow('Agenda', req.params.id);
  if (!found) return res.status(404).json({ error: 'Evento não encontrado.' });
  removerReuniaoJson(req.params.id);
  // Cascade: remove lembretes que apontavam para este evento (eventId) —
  // sem isso ficariam órfãos, referenciando uma reunião que não existe mais.
  const lembretesRestantes = getSheetData('Lembretes').filter(r => String(r.eventId) !== String(req.params.id));
  saveSheetData('Lembretes', lembretesRestantes);
  res.json({ success: true });
});

module.exports = router;
