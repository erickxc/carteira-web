const { listaJSON, ehPlataforma2D, eh2DPrice } = require('./cadenciaServico.cjs');

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

// `ehPlataforma2D`/`eh2DPrice` moram no motor de cadência (reconhecimento num
// lugar só) e são reexportados aqui.

function renomearProduto(nome) {
  if (ehPlataforma2D(nome)) return 'Plataforma 2D';
  if (eh2DPrice(nome)) return '2D Price';
  return String(nome || '').trim();
}

/** Mesmo produto, com nome antigo ou novo ("Monitoria" = "Plataforma 2D"). */
const mesmoProduto = (a, b) => renomearProduto(a) === renomearProduto(b);

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

/** `produtos` ausente (cliente ainda não migrado) ≠ lista vazia: sem a coluna,
 * os campos antigos continuam sendo a fonte e nada deve ser derivado/traduzido. */
const ausente = (x) => x == null || (typeof x === 'string' && !x.trim());

/** Lista gravada com o nome já oficial e sem repetição — a ficha pode ter
 * gravado "Monitoria" antes da migração renomear a categoria. Na repetição,
 * fica o item Ativo (é o que a cadência enxerga). */
function normalizar(raw) {
  const out = [];
  for (const p of listaJSON(raw)) {
    if (!p || typeof p !== 'object') continue;
    const item = { ...p, produto: renomearProduto(p.produto) };
    const i = out.findIndex((x) => x.produto === item.produto);
    if (i < 0) out.push(item);
    else if (out[i].fase !== 'Ativo' && item.fase === 'Ativo') out[i] = item;
  }
  return out;
}

/**
 * `null` quando `produtos` está ausente: o chamador não sobrescreve nada.
 * `linksAtuais`: link de produto que o cliente não tem na lista continua em
 * `linksServicos` — não há item onde guardá-lo, e sobrescrever apagaria a URL.
 */
function derivarCamposLegados(produtos, linksAtuais) {
  if (ausente(produtos)) return null;
  const lista = normalizar(produtos);
  const ativos = lista.filter((p) => p.fase === 'Ativo');
  const linksServicos = {};
  for (const [nome, url] of Object.entries(linksRenomeados(linksAtuais))) {
    if (!lista.some((p) => p.produto === nome)) linksServicos[nome] = url;
  }
  for (const p of lista) if (p.link) linksServicos[p.produto] = p.link;
  const price = lista.find((p) => eh2DPrice(p.produto));
  return {
    servicos: ativos.map((p) => p.produto),
    servicosIndependentes: ativos.filter((p) => p.independente).map((p) => p.produto),
    linksServicos,
    // Sem item 2D Price, login/senha legados ficam como estão (loja irmã com o
    // login do grupo; `sincronizarPriceDoDW` acha o cliente por esse CNPJ).
    // Tirar o produto não apaga: vira Cancelado e o item continua na lista.
    ...(price ? { loginPrice: price.login || '', senhaPriceCifrada: price.senhaCifrada || '' } : {}),
  };
}

/**
 * Antes da migração a categoria `servico` ainda tem o nome antigo, e a 1.6 acha
 * a Monitoria por esse nome (spec §10): os campos derivados saem com o nome
 * VIGENTE da categoria, senão editar a ficha renomearia só aquele cliente antes
 * da hora. `produtos` guarda sempre o nome oficial. Depois da migração, a
 * categoria já é o nome oficial e isto não muda nada.
 */
function comNomesDaCategoria(cliente, categorias) {
  if (ausente(cliente.produtos)) return cliente;
  const vigente = (nome) => (categorias.includes(nome)
    ? nome
    : categorias.find((c) => renomearProduto(c) === nome) ?? nome);
  return {
    ...cliente,
    servicos: listaJSON(cliente.servicos).map(vigente),
    servicosIndependentes: listaJSON(cliente.servicosIndependentes).map(vigente),
    linksServicos: Object.fromEntries(Object.entries(objetoJSON(cliente.linksServicos)).map(([k, v]) => [vigente(k), v])),
  };
}

/**
 * Monta `produtos` a partir do formato antigo — usado pela migração e pela
 * leitura de cliente ainda não migrado (só em memória). `faseDesde` padrão =
 * `createdAt`, para o relógio "nunca atendido" continuar idêntico ao de hoje;
 * sem `createdAt` fica '' (desconhecido), nunca `agora` — senão o cliente sem
 * cadastro conhecido ganharia carência que hoje não tem.
 */
function produtosDeLegado(cliente, opts) {
  const { faseInicial, desde, motivo } = opts;
  const independentes = new Set(nomesRenomeados(cliente.servicosIndependentes));
  const links = linksRenomeados(cliente.linksServicos);
  return nomesRenomeados(cliente.servicos).map((produto) => {
    const item = {
      produto,
      fase: faseInicial ? faseInicial(produto) : 'Ativo',
      faseDesde: (desde && desde(produto)) || cliente.createdAt || '',
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
 * Cliente ainda sem `produtos` → `null`: os campos antigos seguem sendo a
 * fonte, o patch grava como hoje.
 * Retirar quando `dados/maquinas/*.log` mostrar todas as máquinas na 1.7+.
 */
function traduzirPatchLegado(produtosAtuais, patch, agora) {
  if (!patch || 'produtos' in patch || ausente(produtosAtuais)) return null;
  if (!CAMPOS_LEGADOS.some((c) => c in patch)) return null;

  let lista = normalizar(produtosAtuais);
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
    // Link de produto que o cliente não tem não vira item (exigiria produto
    // sem fase): fica em `linksServicos`, que `derivarCamposLegados` preserva.
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
 * conta como mudança a partir de `null`; produto removido, como mudança para
 * `null` sem motivo (tirar produto é Cancelado com motivo, não apagar a linha).
 * O motivo fixo da 1.6 se repete a cada edição: ali vale o `faseDesde` novo. */
function mudancasDeFase(antes, depois) {
  const anteriores = normalizar(antes);
  const atuais = normalizar(depois);
  const out = [];
  for (const p of atuais) {
    const a = anteriores.find((x) => x.produto === p.produto);
    if (a && a.fase === p.fase) continue;
    const motivo = String(p.motivoFase || '').trim();
    const novo = !a
      || motivo !== String(a.motivoFase || '').trim()
      || (motivo === MOTIVO_VERSAO_ANTERIOR && p.faseDesde !== a.faseDesde);
    out.push({ produto: p.produto, de: a ? a.fase : null, para: p.fase, motivoMudou: Boolean(motivo) && novo });
  }
  for (const a of anteriores) {
    if (!atuais.some((x) => x.produto === a.produto)) {
      out.push({ produto: a.produto, de: a.fase, para: null, motivoMudou: false });
    }
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
exports.mesmoProduto = mesmoProduto;
exports.linksRenomeados = linksRenomeados;
exports.comNomesDaCategoria = comNomesDaCategoria;
exports.derivarCamposLegados = derivarCamposLegados;
exports.produtosDeLegado = produtosDeLegado;
exports.traduzirPatchLegado = traduzirPatchLegado;
exports.mudancasDeFase = mudancasDeFase;
