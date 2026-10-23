const express = require('express');
const fs = require('fs');
const path = require('path');
const sessao = require('../reuniao/sessao.cjs');

/**
 * monitorIA nas reuniões (entrega 1: reunião simulada a partir de um arquivo
 * de áudio). Só atende quem chega DIRETO no backend desta máquina: a captura e
 * o transcritor rodam aqui, e uma requisição vinda pelo Apache (outra máquina
 * da LAN) gravaria o áudio da máquina errada.
 */
function criarRouterReuniao({ repo, limparAoIniciar = true } = {}) {
  const repoDe = () => repo ?? require('../dominio/repo.cjs').repoPlanilha();
  const router = express.Router();

  if (limparAoIniciar) {
    try {
      const { SQLITE_DIR } = require('../config.cjs');
      require('../reuniao/pastaReuniao.cjs').limparPastasOrfas(path.join(SQLITE_DIR, 'reunioes'), null);
    } catch (err) {
      console.warn(`reunião: limpeza de pastas órfãs falhou — ${err.message}`);
    }
  }

  router.use((req, res, next) => {
    if (req.headers['x-forwarded-for']) return res.status(403).json({ error: 'O monitorIA nas reuniões só funciona pela Carteira desta máquina (o .exe), não pelo endereço da rede.' });
    next();
  });

  const responderErro = (res, err) => res.status(err.status || 500).json({ error: err.message });

  router.get('/estado', (_req, res) => res.json(sessao.estadoSessao()));

  // Popup do insight: página (janela própria em WebView2), desenho compartilhado e dados.
  const popups = require('../reuniao/popup.cjs');
  const dirPopup = path.join(__dirname, '..', 'reuniao', 'popup');
  router.get('/popup-render.js', (_req, res) => res.type('application/javascript').sendFile(path.join(dirPopup, 'render.cjs')));
  router.get('/popup/:id', (req, res) => {
    if (!/^[a-f0-9]{8}$/.test(req.params.id) || !popups.obter(req.params.id)) return res.status(404).send('Popup não encontrado.');
    res.type('html').send(fs.readFileSync(path.join(dirPopup, 'popup.html'), 'utf8').replaceAll('__ID__', req.params.id));
  });
  router.get('/popup/:id/dados', (req, res) => {
    const p = popups.obter(req.params.id);
    return p ? res.json(p) : res.status(404).json({ error: 'Popup não encontrado.' });
  });
  // Investiga um produto agora e abre os popups (uso: teste e "analisa a bateria" na reunião).
  router.post('/investigar', async (req, res) => {
    const { clientId, produto, fala, abrir = true } = req.body ?? {};
    if (!clientId || !produto) return res.status(400).json({ error: 'Informe "clientId" e "produto".' });
    try {
      const { investigarProduto } = require('../reuniao/produto.cjs');
      const { redigirPopups } = require('../reuniao/popups.cjs');
      const { popups: montados } = await investigarProduto({ repo: repoDe(), clientId, produto });
      // Com a fala do cliente, o monitorIA escolhe os popups e escreve os títulos respondendo a ela.
      const lista = fala ? await redigirPopups({ llm: require('../ia/provider.cjs').clienteLLM(), fala, popups: montados }) : montados;
      const ids = lista.map((p) => popups.registrar(p));
      if (abrir) popups.abrirFila(ids, { notificarReserva: require('../reuniao/notificacaoReuniao.cjs').notificarReuniao });
      res.json({ ids, popups: lista.map((p, i) => ({ id: ids[i], tipo: p.tipo, titulo: p.titulo })) });
    } catch (err) {
      res.status(422).json({ error: err.message });
    }
  });

  router.post('/popup/:id/feito', (req, res) => {
    const p = popups.marcarFeito(req.params.id);
    return p ? res.json({ ok: true }) : res.status(404).json({ error: 'Popup não encontrado.' });
  });

  router.post('/iniciar', (req, res) => {
    const { eventId, simularArquivo, velocidade } = req.body ?? {};
    if (!eventId || !simularArquivo) return res.status(400).json({ error: 'Informe "eventId" e "simularArquivo".' });
    try {
      res.json(sessao.iniciarSessao({ repo: repoDe(), eventId, simularArquivo, velocidade }));
    } catch (err) {
      responderErro(res, err);
    }
  });

  router.post('/encerrar', (_req, res) => {
    try {
      res.json(sessao.encerrarSessao());
    } catch (err) {
      responderErro(res, err);
    }
  });

  return router;
}

module.exports = { criarRouterReuniao };
