// Popups do monitorIA na reunião, montados DO DADO (saída de investigar_produto).
// Formato aprovado (23/10/2026): título-conclusão, 3 números, gráfico, 1 ação.
// O modelo nunca escreve número: ele só escolhe quais popups mostrar e redige o
// título (aplicarRedacao). Popup sem dado suficiente simplesmente não é montado.
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const IDEAL_DIAS = Math.round(15 * 1.12); // giro de 15 dias, máximo = mínimo × 1,12
const TETO_TITULO = 60;
const TETO_ACAO = 48;
const MINUSCULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);

const pct = (v) => `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(Math.abs(v) >= 10 ? 0 : 1).replace('.', ',')}%`;
const pct1 = (v) => `${v.toFixed(1).replace('.', ',')}%`;
function reais(v) {
  if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(1).replace('.', ',')} mi`;
  if (v >= 2e4) return `R$ ${Math.round(v / 1e3)} mil`;
  if (v >= 1e3) return `R$ ${(v / 1e3).toFixed(1).replace('.', ',')} mil`;
  return `R$ ${Math.round(v)}`;
}
const mesCurto = (per) => MESES[(per % 100) - 1];
const cortar = (t, teto) => (t.length <= teto ? t : `${t.slice(0, teto - 1).trimEnd()}…`);
const lista = (itens) => (itens.length <= 1 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`);

// "ROBERTO LEONARDO NONATO DA SILVA 0809520" / "AUTO CENTER JOARI LTDA - CE" -> nome legível.
function nomeLegivel(bruto) {
  const limpo = String(bruto).replace(/\s+\d[\d.\-/]*\s*$/, '').replace(/\s+-\s+[A-Z]{1,3}$/, '').trim();
  return limpo.toLowerCase().split(/\s+/).map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(' ');
}

function popupVenda(r, contexto) {
  const s = r.serieMensal || [];
  if (s.length < 7) return null;
  const ultimo = s[s.length - 1];
  const anteriores = s.slice(-7, -1);
  const pico = anteriores.reduce((a, b) => (b.qtd > a.qtd ? b : a));
  const variacao = 100 * (ultimo.qtd / pico.qtd - 1);
  if (Math.abs(variacao) < 10) return null;
  const lucro = (x) => (x.receita * x.margemPct) / 100;
  const lucroUltimo = lucro(ultimo);
  const lucroMinimoAntes = Math.min(...anteriores.map(lucro));
  const meses = s.slice(-9).map((x) => ({ rotulo: mesCurto(x.per), qtd: x.qtd, margem: x.margemPct }));
  let marco = null;
  meses.forEach((m, i) => {
    if (i === 0) return;
    const delta = m.margem - meses[i - 1].margem;
    if (Math.abs(delta) >= 2 && (!marco || Math.abs(delta) > Math.abs(marco.delta))) marco = { indice: i, delta, rotulo: `margem ${pct1(m.margem)}` };
  });
  const cliente = (r.clientesQueCairam || [])[0];
  const acao = cliente
    ? { icone: 'ligar', titulo: cortar(`Ligue para ${nomeLegivel(cliente.cliente)}`, TETO_ACAO + 10),
        sub: `${cliente.ranking}º maior cliente, parou em ${MESES_LONGOS[Number(String(cliente.ultimaCompra).slice(5, 7)) - 1]}` }
    : { icone: 'perguntar', titulo: `Pergunte o que mudou em ${r.produto.toLowerCase()}`, sub: 'preço, concorrente ou cliente que saiu' };
  // Queda e margem já estão no gráfico (pedido do usuário, 23/10/2026): os números trazem o que
  // ele não mostra — lucro, onde o estoque sobra e onde a venda está pior agora.
  const menor = lucroUltimo < lucroMinimoAntes;
  const numeros = [{ valor: reais(lucroUltimo), rotulo: `lucro em ${mesCurto(ultimo.per)}${menor ? ', o menor' : ''}`, ...(menor ? { neg: true } : {}) }];
  const maisEstoque = (r.porLoja || []).filter((l) => l.diasCobertura != null).sort((a, b) => b.diasCobertura - a.diasCobertura)[0];
  if (maisEstoque) {
    numeros.push({ valor: `${maisEstoque.diasCobertura} dias`, rotulo: `de estoque na ${contexto.nomesLoja[maisEstoque.loja] || maisEstoque.loja}`,
      ...(maisEstoque.diasCobertura >= 2 * IDEAL_DIAS ? { neg: true } : {}) });
  } else {
    numeros.push({ valor: pct1(ultimo.margemPct), rotulo: `margem em ${mesCurto(ultimo.per)}` });
  }
  const mesAtual = r.fim ? MESES[Number(String(r.fim).slice(5, 7)) - 1] : mesCurto(ultimo.per);
  const piorLoja = (r.vendaMesmoPeriodo || []).filter((v) => v.loja && v.anterior > 0)
    .map((v) => ({ ...v, variacao: 100 * (v.atual / v.anterior - 1) })).sort((a, b) => a.variacao - b.variacao)[0];
  if (piorLoja) {
    numeros.push({ valor: pct(piorLoja.variacao), rotulo: `${contexto.nomesLoja[piorLoja.loja] || piorLoja.loja} em ${mesAtual}`, ...(piorLoja.variacao < 0 ? { neg: true } : {}) });
  } else {
    numeros.push({ valor: pct(variacao), rotulo: `vendas desde ${mesCurto(pico.per)}`, ...(variacao < 0 ? { neg: true } : {}) });
  }
  return {
    tipo: 'venda',
    titulo: `${r.produto}: vendas ${variacao < 0 ? 'caíram' : 'subiram'} ${pct(Math.abs(variacao))} desde ${mesCurto(pico.per)}`,
    numeros,
    grafico: { tipo: 'venda', meses, ...(marco ? { marco: { indice: marco.indice, rotulo: marco.rotulo } } : {}) },
    acao,
    cliente: contexto.cliente,
  };
}

function popupEstoque(r, contexto) {
  const lojas = r.porLoja || [];
  const excesso = lojas.reduce((t, l) => t + (l.excesso || 0), 0);
  const falta = lojas.reduce((t, l) => t + (l.falta || 0), 0);
  const algumExagerado = lojas.some((l) => (l.diasCobertura || 0) >= 2 * IDEAL_DIAS);
  if (!algumExagerado && falta === 0) return null;
  const nome = (l) => contexto.nomesLoja[l] || l;
  const transf = r.transferencias || [];
  const totalTransf = transf.reduce((t, x) => t + x.un, 0);
  const porOrigem = {};
  transf.forEach((x) => { porOrigem[x.de] = (porOrigem[x.de] || 0) + x.un; });
  const origem = Object.keys(porOrigem).sort((a, b) => porOrigem[b] - porOrigem[a])[0];
  const destinos = [...new Set(transf.map((x) => nome(x.para)))];
  const lojasComFalta = lojas.filter((l) => (l.falta || 0) > 0).length;
  return {
    tipo: 'estoque',
    titulo: `${r.produto}: estoque acima do ideal em ${lojas.filter((l) => (l.diasCobertura || 0) > IDEAL_DIAS).length} lojas`,
    numeros: [
      { valor: `${Math.round(excesso)} un`, rotulo: 'acima do máximo', neg: true },
      { valor: reais(lojas.reduce((t, l) => t + (l.excessoRs || 0), 0)), rotulo: 'parados', neg: true },
      { valor: `${Math.round(falta)} un`, rotulo: `faltam em ${lojasComFalta} ${lojasComFalta === 1 ? 'loja' : 'lojas'}` },
    ],
    grafico: {
      tipo: 'estoque', ideal: IDEAL_DIAS,
      lojas: lojas.filter((l) => l.diasCobertura != null)
        .sort((a, b) => b.diasCobertura - a.diasCobertura)
        .map((l) => ({ nome: nome(l.loja), dias: l.diasCobertura, alerta: l.diasCobertura >= 2 * IDEAL_DIAS })),
    },
    acao: totalTransf > 0
      // Sem "da/do" antes da loja: o artigo depende do nome ("da Matriz", "de Itaguaí").
      ? { icone: 'transferir', titulo: `Transfira ${totalTransf} un de ${nome(origem)}`, sub: `${r.produto.toLowerCase()} para ${lista(destinos)}` }
      : { icone: 'comprar', titulo: `Reponha ${Math.round(falta)} un de ${r.produto.toLowerCase()}`, sub: 'a rede não tem sobra para transferir' },
    cliente: contexto.cliente,
  };
}

function popupPromocao(r, contexto) {
  const itens = r.promocao || [];
  if (!itens.length) return null;
  const escolhido = itens.find((x) => (x.margemPct || 0) >= 25) || itens[0];
  return {
    tipo: 'promocao',
    titulo: `Para girar sem mexer no preço de ${r.produto.toLowerCase()}`,
    numeros: [
      { valor: reais(escolhido.excessoRs), rotulo: 'acima do máximo' },
      { valor: `${escolhido.diasCobertura} dias`, rotulo: 'de estoque' },
      { valor: pct1(escolhido.margemPct), rotulo: 'margem p/ desconto' },
    ],
    grafico: { tipo: 'promocao', itens: itens.slice(0, 4).map((x) => ({ nome: x.produto, rs: x.excessoRs, margem: x.margemPct, destaque: x === escolhido })) },
    acao: { icone: 'promover', titulo: `Proponha promoção de ${escolhido.produto.toLowerCase()}`, sub: 'vende todo mês e tem margem para desconto' },
    cliente: contexto.cliente,
  };
}

function montarPopups(r, contexto = {}) {
  const ctx = { nomesLoja: {}, ...contexto };
  return [popupVenda(r, ctx), popupEstoque(r, ctx), popupPromocao(r, ctx)].filter(Boolean);
}

/** Aplica a escolha do modelo: [{ id: tipo, titulo?, acaoTitulo? }], na ordem dada. */
function aplicarRedacao(popups, redacoes) {
  const saida = [];
  for (const red of redacoes || []) {
    const p = popups.find((x) => x.tipo === red.id);
    if (!p || saida.includes(p)) continue;
    saida.push({
      ...p,
      titulo: red.titulo ? cortar(String(red.titulo), TETO_TITULO) : p.titulo,
      acao: red.acaoTitulo ? { ...p.acao, titulo: cortar(String(red.acaoTitulo), TETO_ACAO) } : p.acao,
    });
  }
  return saida;
}

/**
 * O monitorIA escolhe quais popups mostrar (e em que ordem) e escreve o título de cada um
 * RESPONDENDO à fala do cliente (pedido do usuário, 23/10/2026). Números, gráfico e ação
 * continuam do dado. Modelo fora do ar: popups com o título padrão — o aviso não some.
 */
async function redigirPopups({ llm, fala, popups }) {
  const comFala = (lista) => lista.map((p) => ({ ...p, fala }));
  if (!popups.length) return [];
  const resumo = popups.map((p) => `- id "${p.tipo}": ${p.titulo} | ${p.numeros.map((n) => `${n.valor} ${n.rotulo}`).join('; ')} | ação: ${p.acao.titulo} (${p.acao.sub})`).join('\n');
  const prompt = `Você é o monitorIA, ajudando um consultor da 2D numa reunião com uma loja de autopeças.
O cliente acabou de dizer: "${fala}"

Popups prontos, com dados reais (não mude números):
${resumo}

Escolha os popups que ajudam a responder ao que o cliente disse (os mais úteis primeiro; descarte os que não ajudam).
Para cada um, escreva um título de até ${TETO_TITULO} caracteres que ligue a fala do cliente ao dado — direto, em português simples,
respeitando a decisão do cliente (se ele recusou mexer no preço, o título mostra outra alavanca).

Responda só com JSON: {"popups": [{"id": "...", "titulo": "..."}]}`;
  try {
    const saida = await llm.gerarJSON(prompt, {});
    const escolhidos = aplicarRedacao(popups, Array.isArray(saida?.popups) ? saida.popups : []);
    return comFala(escolhidos.length ? escolhidos : popups);
  } catch (err) {
    console.warn(`reunião: redação dos popups falhou — ${err.message}`);
    return comFala(popups);
  }
}

module.exports = { montarPopups, aplicarRedacao, redigirPopups, nomeLegivel };
