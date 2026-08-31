const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { ALVOS_DIR, ALVOS_ARQUIVO } = require('../config.cjs');
const { precisaFallback, lerLinhasPorBytes } = require('./leitorBytes.cjs');

/**
 * Leitura da fonte "Dados Alvos" (ver ALVOS_DIR em server/config.cjs).
 *
 * O que este módulo NÃO faz, de propósito: escrever. A pasta é gerada por outro
 * sistema e é a fonte da verdade sobre venda; a Carteira só lê e agrega.
 *
 * Três fatos medidos na base que explicam o desenho daqui:
 *
 * 1. A ABA varia por empresa ("Sheet1" no mock, "Dados" no Mineirão,
 *    "Dados" + "Dados (2)" no Gomec — e no Gomec a PRIMEIRA está VAZIA). Pegar
 *    `SheetNames[0]` devolveria zero linha, sem erro nenhum. A aba é escolhida
 *    pelo header e pela quantidade de linhas.
 *
 * 2. Cada linha é uma VENDA, não o total do mês. No mock, a chave
 *    (loja, cliente, código do produto, ano, mês) repete em 64.496 casos — uma
 *    delas com 317 linhas (lubrificante vendido 317 vezes no balcão em julho).
 *    Não é duplicidade: é o grão do arquivo. Logo toda contagem aqui é SOMA,
 *    nunca "número de linhas".
 *
 * 3. "Receita Acumulada 11 Meses" é receita DA LINHA, apesar do nome
 *    (confirmado pelo usuário). Renomeada para `receita` na normalização, para
 *    não induzir ninguém a tratar como acumulado.
 */

// Header canônico. Só as colunas realmente usadas entram na checagem — assim
// uma coluna nova no arquivo de origem não invalida a aba inteira.
const COLUNAS_OBRIGATORIAS = ['ID_LOJA', 'NOME_CLIENTE', 'DESCRICAO_PRODUTO', 'ANO', 'QTD'];
const COLUNA_RECEITA = 'Receita Acumulada 11 Meses';
const COLUNA_MES = 'MÊS';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/**
 * "AUSENTE DO MAPA" / "NÃO HARMONIZADO" / vazio: itens que o mapa de
 * harmonização não cobriu.
 *
 * Decisão do usuário: **contam como produto real** — entram em soma, ranking e
 * análise como qualquer outro. `harmonizado: false` é apenas informativo e
 * NENHUM cálculo filtra por ele. Existe porque o analisador da 2D tem um
 * interruptor para incluir/excluir essa classe (`produtos_manual_estado`), e sem
 * a marca não haveria como oferecer o mesmo controle aqui depois.
 */
const NAO_HARMONIZADO = new Set(['ausente do mapa', 'nao harmonizado', '']);

const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const normalizar = (t) => semAcento(t).trim().toLowerCase();
const MES_POR_NOME = new Map(MESES.map((m, i) => [normalizar(m), i + 1]));

/** Empresas (pastas) que de fato têm o arquivo. Vazio se a pasta não existe. */
function empresasDisponiveis(raiz = ALVOS_DIR) {
  let entradas;
  try {
    entradas = fs.readdirSync(raiz, { withFileTypes: true });
  } catch {
    return [];
  }
  return entradas
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(raiz, e.name, ALVOS_ARQUIVO)))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function caminhoDaEmpresa(empresa, raiz = ALVOS_DIR) {
  // `basename` impede que um nome de empresa vindo da requisição escape da
  // pasta (`../../`) — é parâmetro de rota, não constante do código.
  return path.join(raiz, path.basename(String(empresa)), ALVOS_ARQUIVO);
}

/**
 * Aba com dados: header compatível e mais linhas. Devolve `null` se nenhuma aba
 * tiver o header esperado — melhor falhar explícito do que agregar zero.
 */
function escolherAba(wb) {
  let melhor = null;
  for (const nome of wb.SheetNames) {
    const ref = wb.Sheets[nome]?.['!ref'];
    if (!ref) continue;
    const cabecalho = xlsx.utils.sheet_to_json(wb.Sheets[nome], { header: 1, defval: null })[0] || [];
    const presentes = new Set(cabecalho.map((c) => String(c ?? '').trim()));
    if (!COLUNAS_OBRIGATORIAS.every((c) => presentes.has(c))) continue;
    const linhas = xlsx.utils.decode_range(ref).e.r; // linhas menos o header
    if (!melhor || linhas > melhor.linhas) melhor = { nome, linhas };
  }
  return melhor?.nome ?? null;
}

/** `{ produto, harmonizado }` — ver NAO_HARMONIZADO acima. */
function classificarProduto(descricao) {
  const texto = String(descricao ?? '').trim();
  const harmonizado = !NAO_HARMONIZADO.has(normalizar(texto));
  return { produto: texto || 'AUSENTE DO MAPA', harmonizado };
}

/** Uma linha do arquivo no vocabulário do app. `null` = linha inutilizável. */
function normalizarLinha(r) {
  const loja = String(r.ID_LOJA ?? '').trim();
  // `Number(null)` é 0 e passa por `isFinite` — daí a checagem ser por ano
  // plausível, não por "é número". Ano ausente inviabiliza qualquer corte de
  // período, que é a razão de existir do arquivo.
  const ano = Number(r.ANO);
  if (!loja || !Number.isInteger(ano) || ano < 2000 || ano > 2100) return null;
  const { produto, harmonizado } = classificarProduto(r.DESCRICAO_PRODUTO);
  return {
    loja,
    // Cliente vazio acontece (265 linhas no mock). Vira rótulo explícito em vez
    // de string vazia, senão a tela soma tudo num grupo sem nome.
    cliente: String(r.NOME_CLIENTE ?? '').trim() || '(sem cliente)',
    produto,
    harmonizado,
    fabricante: String(r.NOME_FABRICANTE ?? '').trim() || '(sem fabricante)',
    ano,
    // `MÊS` é nome em português no arquivo. `0` = mês ausente/ilegível, que
    // aparece nos CSVs da mesma origem — mantido como valor sinalizador, em vez
    // de descartar a venda.
    mes: MES_POR_NOME.get(normalizar(r[COLUNA_MES])) ?? 0,
    codigo: String(r.CODIGO_INTERNO_PRODUTO ?? '').trim(),
    referencia: String(r.CODIGO_REFERENCIA_PRODUTO ?? '').trim(),
    receita: Number(r[COLUNA_RECEITA]) || 0,
    qtd: Number(r.QTD) || 0,
  };
}

/**
 * `xlsx.readFile` normal, quando nenhuma aba estoura o limite de string do
 * Node. Falha explícita se nenhuma aba bater o header — nunca em silêncio.
 */
function lerLinhasViaXlsx(caminho) {
  const wb = xlsx.readFile(caminho);
  const aba = escolherAba(wb);
  if (!aba) {
    throw new Error(`Nenhuma aba com o header esperado em ${path.basename(caminho)} (abas: ${wb.SheetNames.join(', ')}).`);
  }
  return { aba, brutas: xlsx.utils.sheet_to_json(wb.Sheets[aba], { defval: null }) };
}

/**
 * Caminho por bytes (`leitorBytes.cjs`), quando alguma aba passa do limite de
 * string do Node (~512 MB) — o `xlsx.readFile` comum NEM TENTA nesse caso: o
 * SheetJS engole o erro em silêncio e usa uma aba menor (errada) sem avisar.
 * Já causou vínculo com dado incompleto em produção (Altese, Gomec, Motobras)
 * antes desta ligação existir — daí a checagem vir ANTES, não como catch de
 * erro: silêncio malsucedido não pode ser confundido com "arquivo pequeno".
 */
/**
 * `opts.limiteFallback` (bytes) sobrescreve o limite padrão de
 * `leitorBytes.precisaFallback` — existe pra teste conseguir exercitar o
 * caminho por bytes sem precisar de um arquivo real de 400+ MB no fixture.
 */
function lerLinhas(caminho, opts = {}) {
  if (precisaFallback(caminho, opts.limiteFallback)) {
    const r = lerLinhasPorBytes(caminho, COLUNAS_OBRIGATORIAS);
    if (!r) {
      throw new Error(`Nenhuma aba com o header esperado em ${path.basename(caminho)} (leitura por bytes — arquivo grande demais pro xlsx.readFile).`);
    }
    const linhas = [];
    let descartadas = 0;
    for (const r2 of r.linhas) {
      const n = normalizarLinha(r2);
      if (n) linhas.push(n);
      else descartadas += 1;
    }
    return { aba: r.aba, linhas, brutas: r.linhas.length, descartadas };
  }

  const { aba, brutas } = lerLinhasViaXlsx(caminho);
  const linhas = [];
  let descartadas = 0;
  for (const r of brutas) {
    const n = normalizarLinha(r);
    if (n) linhas.push(n);
    else descartadas += 1;
  }
  return { aba, linhas, brutas: brutas.length, descartadas };
}

/** Acumulador soma-tudo, reaproveitado pelos vários cortes. */
function acumular(mapa, chave, extra, linha) {
  let alvo = mapa.get(chave);
  if (!alvo) {
    alvo = { ...extra, receita: 0, qtd: 0, vendas: 0 };
    mapa.set(chave, alvo);
  }
  alvo.receita += linha.receita;
  alvo.qtd += linha.qtd;
  alvo.vendas += 1;
  return alvo;
}

const arredondar = (v) => Math.round(v * 100) / 100;
const ordenarPorReceita = (mapa) => [...mapa.values()]
  .map((x) => ({ ...x, receita: arredondar(x.receita) }))
  .sort((a, b) => b.receita - a.receita);

/**
 * Agregados que as telas consomem. Tudo por SOMA (ver fato 2 no topo).
 *
 * `cruzamento` é o corte mais fino guardado: (loja, cliente, produto, ano, mês)
 * — 108.771 entradas no mock, contra 456.785 linhas. É o grão mínimo que
 * responde "este cliente comprava este produto e parou em tal mês", que é a
 * pergunta que a reunião faz. Guardar o grão de venda não acrescentaria
 * resposta nenhuma e multiplicaria o cache por 4.
 */
function agregar(linhas) {
  const lojas = new Map();
  const clientes = new Map();
  const produtos = new Map();
  const fabricantes = new Map();
  const cruzamento = new Map();
  const periodos = new Set();

  for (const l of linhas) {
    acumular(lojas, l.loja, { loja: l.loja }, l);
    acumular(clientes, `${l.loja} ${l.cliente}`, { loja: l.loja, cliente: l.cliente }, l);
    acumular(produtos, `${l.loja} ${l.produto}`, { loja: l.loja, produto: l.produto, harmonizado: l.harmonizado }, l);
    acumular(fabricantes, `${l.loja} ${l.fabricante}`, { loja: l.loja, fabricante: l.fabricante }, l);
    acumular(
      cruzamento,
      `${l.loja} ${l.cliente} ${l.produto} ${l.ano} ${l.mes}`,
      { loja: l.loja, cliente: l.cliente, produto: l.produto, ano: l.ano, mes: l.mes },
      l,
    );
    periodos.add(`${l.ano}-${String(l.mes).padStart(2, '0')}`);
  }

  return {
    lojas: ordenarPorReceita(lojas),
    clientes: ordenarPorReceita(clientes),
    produtos: ordenarPorReceita(produtos),
    fabricantes: ordenarPorReceita(fabricantes),
    cruzamento: [...cruzamento.values()].map((x) => ({ ...x, receita: arredondar(x.receita) })),
    periodos: [...periodos].sort(),
    totalLinhas: linhas.length,
  };
}

function lerEAgregar(empresa, raiz = ALVOS_DIR, opts = {}) {
  const caminho = caminhoDaEmpresa(empresa, raiz);
  const { aba, linhas, brutas, descartadas } = lerLinhas(caminho, opts);
  return { empresa, aba, brutas, descartadas, ...agregar(linhas) };
}

module.exports = {
  ALVOS_ARQUIVO,
  MESES,
  empresasDisponiveis,
  caminhoDaEmpresa,
  escolherAba,
  classificarProduto,
  normalizarLinha,
  lerLinhas,
  agregar,
  lerEAgregar,
};
