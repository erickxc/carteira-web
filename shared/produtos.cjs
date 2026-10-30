const { listaJSON } = require('./cadenciaServico.cjs');

/**
 * Regras puras de PRODUTO do cliente (1.7.0) — compartilhadas entre backend
 * (`require`) e frontend (`carteira-shared/produtos.cjs`), pelo mesmo motivo
 * do motor de cadência: uma regra só, sem cópia lateral divergindo.
 *
 * `Cliente.produtos` é a fonte; `servicos`/`servicosIndependentes`/
 * `linksServicos`/`loginPrice`/`senhaPriceCifrada` passam a ser DERIVADOS
 * (`derivarCamposLegados`) pra cadência, cards, monitorIA e espelho `.xlsx`
 * seguirem funcionando sem mudar tudo de uma vez.
 * Spec: docs/superpowers/specs/2026-10-30-produtos-do-cliente-design.md
 */

/** Lista oficial, nesta ordem (decisão do usuário, 30/10/2026). */
const PRODUTOS_OFICIAIS = [
  'Plataforma 2D', 'Controladoria', 'Apura', '2D Alcance', '2D Nexus',
  'OptiMarco', '2D Price', 'Protocolo GPS', 'Raptor',
];
/** Só `Ativo` entra em `servicos` derivado e na cadência. */
const FASES = ['Em breve', 'Suspenso', 'Ativo', 'Cancelado'];

const MOTIVO_VERSAO_ANTERIOR = 'alterado por versão anterior da Carteira';

// Aceitam nome antigo E novo: dado antigo (eventos com "Monitoria") e máquina
// ainda na 1.6 continuam reconhecidos depois da renomeação.
const ehPlataforma2D = (nome) => /plataforma|monitor/i.test(String(nome || ''));
const eh2DPrice = (nome) => /price|prec/i.test(String(nome || ''));

function renomearProduto(nome) {
  if (ehPlataforma2D(nome)) return 'Plataforma 2D';
  if (eh2DPrice(nome)) return '2D Price';
  return String(nome || '').trim();
}

/** `linksServicos` pode chegar como objeto ou texto JSON (mesma dupla
 * serialização descrita em `listaJSON`). */
function objetoJSON(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

/** Lista de nomes renomeados, sem repetição ("Monitoria" + "Plataforma 2D" = um só). */
const nomesRenomeados = (raw) => [...new Set(listaJSON(raw).map(renomearProduto).filter(Boolean))];

/** Links com a chave já no nome oficial. */
function linksRenomeados(raw) {
  const out = {};
  for (const [k, v] of Object.entries(objetoJSON(raw))) if (v) out[renomearProduto(k)] = v;
  return out;
}

function derivarCamposLegados(produtos) {
  const lista = listaJSON(produtos);
  const ativos = lista.filter((p) => p.fase === 'Ativo');
  const linksServicos = {};
  for (const p of lista) if (p.link) linksServicos[p.produto] = p.link;
  const price = lista.find((p) => eh2DPrice(p.produto));
  return {
    servicos: ativos.map((p) => p.produto),
    servicosIndependentes: ativos.filter((p) => p.independente).map((p) => p.produto),
    linksServicos,
    // Vazio (e não ausente) quando não há 2D Price: o derivado sobrescreve o
    // campo antigo, então tirar o produto também limpa o login/senha legado.
    loginPrice: (price && price.login) || '',
    senhaPriceCifrada: (price && price.senhaCifrada) || '',
  };
}

/**
 * Monta `produtos` a partir do formato antigo — usado pela migração e pela
 * leitura de cliente ainda não migrado (só em memória). `faseDesde` padrão =
 * `createdAt`, para o relógio "nunca atendido" continuar idêntico ao de hoje.
 */
function produtosDeLegado(cliente, opts) {
  const { agora, faseInicial, desde, motivo } = opts;
  const independentes = new Set(nomesRenomeados(cliente.servicosIndependentes));
  const links = linksRenomeados(cliente.linksServicos);
  return nomesRenomeados(cliente.servicos).map((produto) => {
    const item = {
      produto,
      fase: faseInicial ? faseInicial(produto) : 'Ativo',
      faseDesde: (desde && desde(produto)) || cliente.createdAt || agora,
      motivoFase: motivo,
      independente: independentes.has(produto),
    };
    if (links[produto]) item.link = links[produto];
    if (eh2DPrice(produto)) {
      if (cliente.loginPrice) item.login = cliente.loginPrice;
      if (cliente.senhaPriceCifrada) item.senhaCifrada = cliente.senhaPriceCifrada;
    }
    return item;
  });
}

const CAMPOS_LEGADOS = ['servicos', 'servicosIndependentes', 'linksServicos', 'loginPrice', 'senhaPriceCifrada'];

/**
 * Máquina 1.6.x edita só os campos antigos; como o servidor deriva esses
 * campos de `produtos`, a edição se perderia em silêncio. Aqui ela vira
 * mudança em `produtos`: aparece em `servicos` → Ativo; era Ativo e sumiu →
 * Cancelado. Em breve/Suspenso/Cancelado não estão no `servicos` derivado,
 * então "sumir" dali não significa nada — não são tocados.
 * Retirar quando `dados/maquinas/*.log` mostrar todas as máquinas na 1.7+.
 */
function traduzirPatchLegado(produtosAtuais, patch, agora) {
  if (!patch || 'produtos' in patch) return null;
  if (!CAMPOS_LEGADOS.some((c) => c in patch)) return null;

  let lista = listaJSON(produtosAtuais).map((p) => ({ ...p }));
  const mudarFase = (p, fase) => Object.assign(p, { fase, faseDesde: agora, motivoFase: MOTIVO_VERSAO_ANTERIOR });

  if ('servicos' in patch) {
    const novos = nomesRenomeados(patch.servicos);
    for (const p of lista) {
      const presente = novos.includes(p.produto);
      if (presente && p.fase !== 'Ativo') mudarFase(p, 'Ativo');
      else if (!presente && p.fase === 'Ativo') mudarFase(p, 'Cancelado');
    }
    for (const produto of novos) {
      if (!lista.some((p) => p.produto === produto)) {
        lista.push({ produto, fase: 'Ativo', faseDesde: agora, motivoFase: MOTIVO_VERSAO_ANTERIOR });
      }
    }
  }
  if ('servicosIndependentes' in patch) {
    // Só os Ativos aparecem no derivado; os demais guardam o que tinham.
    const inds = new Set(nomesRenomeados(patch.servicosIndependentes));
    for (const p of lista) if (p.fase === 'Ativo') p.independente = inds.has(p.produto);
  }
  if ('linksServicos' in patch) {
    // ponytail: link de produto que o cliente não tem é ignorado (a 1.6 só
    // edita link de serviço marcado); guardar exigiria produto sem fase.
    const links = linksRenomeados(patch.linksServicos);
    lista = lista.map((p) => {
      const { link: _antigo, ...resto } = p;
      return links[p.produto] ? { ...resto, link: links[p.produto] } : resto;
    });
  }
  const price = lista.find((p) => eh2DPrice(p.produto));
  if (price && 'loginPrice' in patch) price.login = patch.loginPrice || '';
  if (price && 'senhaPriceCifrada' in patch) price.senhaCifrada = patch.senhaPriceCifrada || '';
  return lista;
}

/** Fases que mudaram de `antes` para `depois`; `motivoMudou=false` = trocou a
 * fase sem informar motivo novo (o domínio recusa com 400). Produto novo
 * conta como mudança a partir de `null`. */
function mudancasDeFase(antes, depois) {
  const anteriores = listaJSON(antes);
  const out = [];
  for (const p of listaJSON(depois)) {
    const a = anteriores.find((x) => x.produto === p.produto);
    if (a && a.fase === p.fase) continue;
    const motivo = String(p.motivoFase || '').trim();
    out.push({
      produto: p.produto,
      de: a ? a.fase : null,
      para: p.fase,
      motivoMudou: Boolean(motivo) && (!a || motivo !== String(a.motivoFase || '').trim()),
    });
  }
  return out;
}

// Atribuições individuais pelo mesmo motivo de `cadenciaServico.cjs` (o
// analisador de export do Vite não lê um `module.exports = {...}` único).
exports.PRODUTOS_OFICIAIS = PRODUTOS_OFICIAIS;
exports.FASES = FASES;
exports.MOTIVO_VERSAO_ANTERIOR = MOTIVO_VERSAO_ANTERIOR;
exports.ehPlataforma2D = ehPlataforma2D;
exports.eh2DPrice = eh2DPrice;
exports.renomearProduto = renomearProduto;
exports.derivarCamposLegados = derivarCamposLegados;
exports.produtosDeLegado = produtosDeLegado;
exports.traduzirPatchLegado = traduzirPatchLegado;
exports.mudancasDeFase = mudancasDeFase;
