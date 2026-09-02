const express = require('express');
const { repoPlanilha } = require('../dominio/repo.cjs');
const { linhasCadastro, resumoCadastro, gerarAlertasAlvos } = require('../alvos/painel.cjs');
const { catalogoDoCliente, resumoGeralDoCliente, analiseEstrategicaDoCliente } = require('../alvos/consulta.cjs');
const { sugerir, vincular, carregar } = require('../alvos/mapa.cjs');
const { empresasDisponiveis } = require('../alvos/leitor.cjs');
const { agregadoDaEmpresa } = require('../alvos/cache.cjs');

/**
 * Dashboard de cadastro da integração "Dados Alvos" (`/clientes` no front).
 * Só leitura, exceto `/vinculo` — mesma regra do resto do módulo `alvos/`:
 * nada aqui escreve nos dados de venda, só no arquivo de vínculos.
 */
const router = express.Router();
const repo = repoPlanilha();

router.get('/cadastro', (_req, res) => {
  const linhas = linhasCadastro(repo.get('Clientes'));
  res.json({ resumo: resumoCadastro(linhas), linhas });
});

/**
 * Não aquece cache (ver painel.cjs) — pode ser chamado com frequência (a tela
 * de clientes recarrega) e não deve travar por causa de um xlsx grande.
 */
router.get('/alertas', (_req, res) => {
  res.json(gerarAlertasAlvos(repo));
});

router.get('/empresas', (_req, res) => {
  res.json(empresasDisponiveis());
});

/**
 * Tags de cliente final (vocabulário COMPARTILHADO do Ecossistema-Monitoria,
 * `Bancos/tags.json` — ver `alvos/tags.cjs`). Só as ativas: é o que se oferece
 * pra marcar na tela.
 */
router.get('/tags', (_req, res) => {
  res.json(require('../alvos/tags.cjs').tagsAtivas());
});

/**
 * Candidatos ranqueados de vínculo pra uma empresa (ver `mapa.sugerir`).
 * `forcar=1` ignora o cache — usado pelo botão "atualizar" da tela de vínculo,
 * nunca automático (custa até ~20s).
 */
router.get('/sugestoes/:empresa', (req, res) => {
  try {
    const agregado = agregadoDaEmpresa(req.params.empresa, { forcar: req.query.forcar === '1' });
    res.json(sugerir(req.params.empresa, agregado, repo.get('Clientes')));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

router.get('/vinculos', (_req, res) => {
  res.json(carregar());
});

router.post('/vinculo', (req, res) => {
  const { empresa, loja, clientId } = req.body || {};
  if (!empresa || !loja) return res.status(400).json({ error: 'empresa e loja são obrigatórios.' });
  if (clientId && !repo.get('Clientes').some((c) => String(c.id) === String(clientId))) {
    return res.status(404).json({ error: `Cliente "${clientId}" não encontrado.` });
  }
  vincular(empresa, loja, clientId || null);
  res.json({ success: true });
});

/**
 * Catálogo de produtos/clientes finais pro seletor do formulário de reunião.
 * `aquecer=1` é o único caminho que pode custar ~20s — usado pela ficha do
 * cliente ao abrir, nunca pelo próprio modal de reunião (ver consulta.cjs).
 */
router.get('/catalogo/:clientId', (req, res) => {
  const cliente = repo.get('Clientes').find((c) => String(c.id) === req.params.clientId);
  if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });
  res.json(catalogoDoCliente(cliente.id, { aquecer: req.query.aquecer === '1' }));
});

/**
 * Escopo GERAL (item 5.2): série de receita/qtd por período + total de
 * clientes finais distintos, sem interpretação nenhuma. Mesma regra de custo
 * do catálogo: nunca aquece sozinho.
 */
router.get('/resumo/:clientId', (req, res) => {
  const cliente = repo.get('Clientes').find((c) => String(c.id) === req.params.clientId);
  if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });
  res.json(resumoGeralDoCliente(cliente, { aquecer: req.query.aquecer === '1' }));
});

/**
 * Escopo ESTRATÉGICO (item 5.3): as 4 análises do relatório do analisador da
 * 2D. Mesma regra de custo do resumo/catálogo: nunca aquece sozinho.
 */
router.get('/estrategico/:clientId', (req, res) => {
  const cliente = repo.get('Clientes').find((c) => String(c.id) === req.params.clientId);
  if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });
  res.json(analiseEstrategicaDoCliente(cliente, { aquecer: req.query.aquecer === '1' }));
});

module.exports = router;
