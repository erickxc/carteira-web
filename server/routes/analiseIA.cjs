const express = require('express');
const { repoPlanilha } = require('../dominio/repo.cjs');
const { conversar } = require('../ia/provider.cjs');
const { montarSystemPrompt } = require('../ia/agente.cjs');
const { gerarAlertas, gerarPadroesCarteira } = require('../ia/alertas.cjs');

const router = express.Router();
const repo = repoPlanilha();

router.get('/clientes/:id/analise', (req, res) => {
  const analises = repo.get('AnalisesIA');
  const analise = analises.find((a) => String(a.clientId) === String(req.params.id));
  if (!analise) return res.status(404).json({ error: 'Cliente ainda não foi analisado.' });
  res.json(analise);
});

/**
 * Alertas conversáveis da tela do monitorIA. Recalculados a cada chamada (são
 * derivados de cliente/agenda/análise, que mudam o tempo todo) — nada é
 * gravado, então não há estado de alerta pra ficar obsoleto.
 */
router.get('/alertas', (_req, res) => {
  res.json(gerarAlertas(repo));
});

/**
 * Padrões da CARTEIRA — separado de `/alertas` (por-cliente) de propósito:
 * um card de padrão não tem `clientId` nem faz sentido misturado na mesma
 * lista que "cliente X está sem contato". Ver `gerarPadroesCarteira`.
 */
router.get('/padroes', (_req, res) => {
  res.json(gerarPadroesCarteira(repo));
});

router.get('/acoes', (req, res) => {
  const acoes = repo.get('AcoesIA').slice().sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));
  res.json(acoes);
});

// Assistente geral (não fica preso a um único cliente): quando `clientId` vem
// no corpo, o system prompt já entra com o dossiê daquele cliente (evita uma
// ida extra à ferramenta `buscar_dossie_cliente` no caso mais comum — usuário
// perguntando sobre o cliente que está com a página aberta); sem `clientId`,
// o próprio agente decide se/quando consultar `buscar_clientes`/
// `buscar_dossie_cliente` pra responder.
router.post('/chat', async (req, res) => {
  const { texto, historico, clientId, monitor } = req.body ?? {};
  if (typeof texto !== 'string' || !texto.trim()) {
    return res.status(400).json({ error: 'Campo "texto" é obrigatório.' });
  }

  // As regras gerais vão no system prompt (e não só como ferramenta) — ver
  // `blocoMemoria` em `server/ia/agente.cjs`.
  const mensagens = [
    { role: 'system', content: montarSystemPrompt({ clientId, memorias: repo.get('MemoriaIA') }) },
    ...(Array.isArray(historico) ? historico : []),
    { role: 'user', content: texto },
  ];

  try {
    const resposta = await conversar({ mensagens, origem: 'chat', repo, monitor });
    res.json({ resposta });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
