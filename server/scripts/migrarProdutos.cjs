/**
 * Migração única para a 1.7 (spec §7): cadastro por produto, renomeação
 * Monitoria → Plataforma 2D / Precificação → 2D Price, `servicos` gravado como
 * texto e linha-base do `ProdutosHistorico`.
 *
 * Tudo roda primeiro numa cópia em memória: é assim que a simulação não grava
 * nada e que uma divergência de relógio aborta antes da primeira escrita. Só
 * então, com `--aplicar`, os mesmos passos rodam no banco. Idempotente: quem já
 * migrou mantém o que tem, e rodar de novo depois de uma queda completa o resto.
 *
 * Uso:  node server/scripts/migrarProdutos.cjs            (simula, não grava)
 *       node server/scripts/migrarProdutos.cjs --aplicar  (cópia do banco e grava)
 *       --ignorar-maquinas=Bruno2D,JENIFFER-2D            (máquinas na 1.6 que o
 *                                                          usuário confirmou fora de uso)
 *       --aceitar-registro-sem-par                        (entradas do registro do DW sem
 *                                                          cliente/produto, conferidas na simulação)
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { DATA_DIR, SQLITE_FILE } = require('../config.cjs');
const { isClient } = require('../modo.cjs');
const { repoPlanilha, repoMemoria } = require('../dominio/repo.cjs');
const { atualizar, produtosDoCliente, MOTIVO_LEGADO } = require('../dominio/clientes.cjs');
const produtosHistorico = require('../dominio/produtosHistorico.cjs');
const { listaJSON, buildFilaCadencia } = require('../../shared/cadenciaServico.cjs');
const { PRODUTOS_OFICIAIS, renomearProduto, nomesRenomeados } = require('../../shared/produtos.cjs');

const MOTIVO = 'migração para produtos (1.7)';
/** Produtos acrescentados pelo DW nesta data (spec §4): o relógio parte daqui. */
const DATA_DW = '2026-10-30';
const REGISTRO_DW = path.join(DATA_DIR, 'migracoes', `${DATA_DW}-produtos-dw.json`);
const SHEETS = ['Categorias', 'Clientes', 'Agenda', 'AgendaSeries', 'Acoes', 'Cadencias', 'ProdutosHistorico'];

const faseInicial = (produto) => (/nexus|alcance/i.test(produto) ? 'Em breve' : 'Ativo');
const ehTexto = (v) => typeof v === 'string' && Boolean(v.trim());

/** A 1.6 acha a Monitoria por `/monitor/i`: "Plataforma 2D" some do relógio dela
 * no snapshot (spec §10). Log ilegível conta como atrasada. */
function abaixoDe17(versao) {
  const [maior, menor] = String(versao).split('.').map(Number);
  return !(maior > 1 || (maior === 1 && menor >= 7));
}

/** Última linha de cada `<computador>.log` = versão atual (`registroVersao.cjs`).
 * Sem a pasta, lança: não saber quem atualizou não pode liberar a gravação. */
function maquinasAtrasadas(dir) {
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.log'))
    .map((f) => ({
      maquina: f.slice(0, -'.log'.length),
      versao: fs.readFileSync(path.join(dir, f), 'utf8').trim().split('\n').pop().split('\t')[1] || '?',
    }))
    .filter((m) => abaixoDe17(m.versao));
}

/** `{ clienteId: Set<nome oficial> }` do registro de 30/10; `null` se o formato
 * não é o esperado — sem ele, os clientes voltariam a nascer vencidos, e a trava
 * de relógios não pega isso, porque nada muda em relação a hoje. */
function entradasDoDw(registro) {
  if (registro === undefined) return new Map();
  if (!registro || !Array.isArray(registro.clientes)) return null;
  const entradas = new Map();
  for (const c of registro.clientes) {
    if (!c || !ehTexto(c.id) || !Array.isArray(c.entra)) return null;
    const nomes = entradas.get(c.id) || new Set();
    for (const nome of nomesRenomeados(c.entra)) nomes.add(nome);
    entradas.set(c.id, nomes);
  }
  return entradas;
}

/** Quanto do registro achou cliente+produto. Casada não é aplicada: quem já migrou
 * ou tem decisão real mantém a data, e a 2ª rodada não aplica nada. */
function conferirRegistro(entradas, clientes, novosDesde) {
  const porId = new Map(clientes.map((c) => [String(c.id), c]));
  const naoCasadas = [];
  let total = 0;
  for (const [id, nomes] of entradas) {
    const cliente = porId.get(id);
    const tem = new Set(cliente ? produtosDoCliente(cliente).map((p) => renomearProduto(p.produto)) : []);
    for (const produto of nomes) {
      total += 1;
      if (!tem.has(produto)) naoCasadas.push({ id, produto, motivo: cliente ? 'cliente não tem este produto' : 'cliente não encontrado' });
    }
  }
  return { entradas: total, casadas: total - naoCasadas.length, aplicadas: novosDesde.size, naoCasadas };
}

function migrarCategorias(repo) {
  const todas = repo.get('Categorias');
  const posicao = (valor) => {
    const i = PRODUTOS_OFICIAIS.indexOf(valor);
    return i < 0 ? PRODUTOS_OFICIAIS.length : i;
  };
  const vistos = new Set();
  const fundidas = [];
  const servico = todas
    .filter((c) => c.tipo === 'servico')
    .sort((a, b) => Number(a.ordem ?? 0) - Number(b.ordem ?? 0))
    .filter((c) => {
      const para = renomearProduto(c.valor);
      if (vistos.has(para)) { fundidas.push({ id: c.id, de: c.valor, para }); return false; }
      vistos.add(para);
      return true;
    })
    .map((c) => ({ ...c, valor: renomearProduto(c.valor) }))
    .sort((a, b) => posicao(a.valor) - posicao(b.valor)) // estável: sem posição, mantém a ordem
    .map((c, ordem) => ({ ...c, ordem }));
  repo.save('Categorias', [...todas.filter((c) => c.tipo !== 'servico'), ...servico]);
  return { nomes: servico.map((c) => c.valor), fundidas };
}

function migrarClientes(repo, entradas) {
  const fases = {};
  const textoClientes = [];
  const novosDesde = new Set(); // `clientId|produto` cujo relógio pode mudar (spec §4)
  const refeitos = new Set();
  for (const c of repo.get('Clientes')) {
    const entra = entradas.get(String(c.id));
    if (ehTexto(c.servicos)) textoClientes.push(c.id);
    // `produtosDoCliente` monta do formato antigo com MOTIVO_LEGADO, o mesmo
    // que a ficha grava: um caminho só para quem foi editado antes da migração.
    // Motivo diferente é decisão real de alguém e fica como está.
    const produtos = produtosDoCliente(c).map((p) => {
      if (p.motivoFase !== MOTIVO_LEGADO) return p;
      const produto = renomearProduto(p.produto);
      const doDw = Boolean(entra && entra.has(produto));
      if (doDw) novosDesde.add(`${c.id}|${produto}`);
      refeitos.add(`${c.id}|${produto}`);
      return { ...p, produto, fase: faseInicial(produto), faseDesde: doDw ? DATA_DW : (c.createdAt || ''), motivoFase: MOTIVO };
    });
    const patch = { produtos };
    const contatos = listaJSON(c.contatos);
    if (contatos.some((k) => k && k.servicos)) {
      patch.contatos = contatos.map((k) => (k && k.servicos ? { ...k, servicos: nomesRenomeados(k.servicos) } : k));
    }
    const gravado = atualizar(repo, c.id, patch, { efeitosExternos: false });
    // Trocar a fase mantendo a data faz o domínio carimbar "agora"; aqui a data
    // é a do cadastro (spec §7). Com a fase já igual, a segunda gravação a respeita.
    if (gravado.produtos.some((p, i) => p.faseDesde !== produtos[i].faseDesde)) {
      atualizar(repo, c.id, { produtos }, { efeitosExternos: false });
    }
    for (const p of produtos) fases[p.fase] = (fases[p.fase] || 0) + 1;
  }
  return { fases, textoClientes, novosDesde, refeitos };
}

/** Agenda/AgendaSeries: nome oficial, array de verdade, sem repetir. */
function migrarServicos(repo, sheet) {
  let mudaram = 0;
  let texto = 0;
  const linhas = repo.get(sheet).map((l) => {
    if (l.servicos == null) return l;
    if (ehTexto(l.servicos)) texto += 1;
    const servicos = nomesRenomeados(l.servicos);
    if (JSON.stringify(servicos) === JSON.stringify(l.servicos)) return l;
    mudaram += 1;
    return { ...l, servicos };
  });
  if (mudaram) repo.save(sheet, linhas);
  return { mudaram, texto };
}

/** Linha-base; a que a ficha gravou com MOTIVO_LEGADO era suposição ("Ativo desde
 * o cadastro") e cai junto com o item refeito, senão um mês passado mostraria o
 * Price que só entrou em 30/10. */
function migrarHistorico(repo, refeitos, agora) {
  const historico = repo.get('ProdutosHistorico');
  const cai = (h) => h.motivo === MOTIVO_LEGADO && refeitos.has(`${h.clientId}|${renomearProduto(h.produto)}`);
  const removidas = historico.filter(cai);
  if (removidas.length) repo.save('ProdutosHistorico', historico.filter((h) => !cai(h)));
  return {
    novas: produtosHistorico.sincronizar(repo, agora),
    removidas: removidas.map(({ clientId, produto, fase, mudouEm }) => ({ clientId, produto, fase, mudouEm })),
  };
}

function aplicarPassos(repo, entradas, agora) {
  // Categorias primeiro: `comNomesDaCategoria` deriva `servicos` com o nome vigente.
  const categorias = migrarCategorias(repo);
  const clientes = migrarClientes(repo, entradas);
  const eventos = migrarServicos(repo, 'Agenda');
  const series = migrarServicos(repo, 'AgendaSeries');
  const historico = migrarHistorico(repo, clientes.refeitos, agora);
  return { categorias, clientes, eventos, series, historico };
}

/** Relógio de TODOS os clientes, inclusive os fora de atendimento hoje: quem
 * voltar a ficar ativo precisa encontrar o mesmo relógio (spec, critério de sucesso). */
function relogiosPorCliente(repo, agora) {
  const clientes = repo.get('Clientes').map((c) => ({ ...c, estado: 'Ativo', status: 'Regular', pausadoAte: '' }));
  const cadencias = Object.fromEntries(repo.get('Cadencias').map((r) => [r.chave, Number(r.valor)]));
  const mapa = new Map();
  for (const { cliente, relogios } of buildFilaCadencia(clientes, repo.get('Agenda'), repo.get('Acoes'), cadencias, agora)) {
    for (const r of relogios) mapa.set(`${cliente.id}|${r.servico}`, `${r.status} (${r.atraso})`);
  }
  return mapa;
}

function compararRelogios(antes, depois, novosDesde, clientes) {
  const permitidas = [];
  const divergencias = [];
  for (const chave of new Set([...antes.keys(), ...depois.keys()])) {
    const de = antes.get(chave) ?? null;
    const para = depois.get(chave) ?? null;
    if (de === para) continue;
    const [clientId, servico] = chave.split('|');
    const empresa = (clientes.find((c) => String(c.id) === clientId) || {}).empresa;
    (novosDesde.has(chave) ? permitidas : divergencias).push({ clientId, empresa, servico, antes: de, depois: para });
  }
  return { comparados: antes.size, permitidas, divergencias };
}

/**
 * `opts.backup` (só com `aplicar`): cópia do banco, aguardada antes da primeira
 * escrita; se falhar, nada é gravado. `opts.maquinasDir`: pasta dos logs de versão.
 */
async function migrar(repo, opts = {}) {
  const { aplicar = false, registroDw, ignorarMaquinas = [], aceitarRegistroSemPar = false, backup } = opts;
  const agora = new Date(opts.agora ?? Date.now());
  const atrasadas = maquinasAtrasadas(opts.maquinasDir ?? path.join(DATA_DIR, 'maquinas'));
  const entradas = entradasDoDw(registroDw);

  const relatorio = {
    gravado: false,
    recusa: null,
    copia: null,
    maquinasAtrasadas: atrasadas,
    categorias: [],
    categoriasFundidas: [],
    registroDw: { entradas: 0, casadas: 0, aplicadas: 0, naoCasadas: [] },
    clientes: { total: 0, porFase: {} },
    textoCorrigido: { clientes: 0, eventos: 0 },
    eventosRenomeados: 0,
    seriesRenomeadas: 0,
    historico: 0,
    historicoRemovido: [],
    relogios: { comparados: 0, permitidas: [], divergencias: [] },
  };
  if (!entradas) {
    return { ...relatorio, recusa: 'Registro do DW em formato inesperado: o esperado é { clientes: [{ id, entra: [produtos] }] }, com id em texto em todos os itens.' };
  }

  // Ensaio geral: a mesma sequência sobre uma cópia em memória.
  const copia = repoMemoria(Object.fromEntries(SHEETS.map((s) => [s, repo.get(s)])));
  const antes = relogiosPorCliente(copia, agora);
  const ensaio = aplicarPassos(copia, entradas, agora);
  const relogios = compararRelogios(antes, relogiosPorCliente(copia, agora), ensaio.clientes.novosDesde, copia.get('Clientes'));

  Object.assign(relatorio, {
    categorias: ensaio.categorias.nomes,
    categoriasFundidas: ensaio.categorias.fundidas,
    registroDw: conferirRegistro(entradas, copia.get('Clientes'), ensaio.clientes.novosDesde),
    clientes: { total: copia.get('Clientes').length, porFase: ensaio.clientes.fases },
    textoCorrigido: { clientes: ensaio.clientes.textoClientes.length, eventos: ensaio.eventos.texto },
    eventosRenomeados: ensaio.eventos.mudaram,
    seriesRenomeadas: ensaio.series.mudaram,
    historico: ensaio.historico.novas,
    historicoRemovido: ensaio.historico.removidas,
    relogios,
  });

  if (relogios.divergencias.length) {
    relatorio.recusa = `${relogios.divergencias.length} relógio(s) divergem fora da regra de "desde quando" (spec §4).`;
    return relatorio;
  }
  if (!aplicar) return relatorio;

  const { naoCasadas } = relatorio.registroDw;
  if (naoCasadas.length && !aceitarRegistroSemPar) {
    relatorio.recusa = `${naoCasadas.length} entrada(s) do registro do DW sem cliente/produto: esses clientes nasceriam vencidos. `
      + 'Confira a lista; se estiver certa (ex.: cliente apagado depois de 30/10), rode com --aceitar-registro-sem-par.';
    return relatorio;
  }

  const bloqueiam = atrasadas.filter((m) => !ignorarMaquinas.includes(m.maquina));
  if (bloqueiam.length) {
    relatorio.recusa = `Máquinas abaixo da 1.7: ${bloqueiam.map((m) => `${m.maquina} (${m.versao})`).join(', ')}. `
      + 'A 1.6 não reconhece "Plataforma 2D" no snapshot e perde o relógio. Atualize-as ou, se não estão em uso, '
      + 'nomeie exatamente em --ignorar-maquinas=.';
    return relatorio;
  }

  if (backup) relatorio.copia = await backup();
  aplicarPassos(repo, entradas, agora);
  relatorio.gravado = true;
  return relatorio;
}

/** API de backup do SQLite (o banco usa WAL). Nunca sobrescreve: uma 2ª rodada
 * no mesmo dia não pode trocar o "antes" verdadeiro pelo banco já migrado. */
async function copiarBanco(agora = new Date()) {
  const pasta = path.join(DATA_DIR, 'migracoes');
  fs.mkdirSync(pasta, { recursive: true });
  const base = path.join(pasta, `${agora.toISOString().slice(0, 10)}-produtos-1.7.antes`);
  const destino = fs.existsSync(`${base}.sqlite`) ? `${base}-${Date.now()}.sqlite` : `${base}.sqlite`;
  const origem = new Database(SQLITE_FILE, { readonly: true });
  try { await origem.backup(destino); } finally { origem.close(); }
  return destino;
}

function imprimir(r) {
  console.log(`Categorias de produto: ${r.categorias.join(', ')}`);
  for (const c of r.categoriasFundidas) console.log(`  [CATEGORIA REMOVIDA] "${c.de}" (${c.id}). Motivo: duplicada de "${c.para}" depois da renomeação`);
  const dw = r.registroDw;
  console.log(`Registro do DW: ${dw.entradas} entrada(s) · ${dw.casadas} casada(s) · ${dw.aplicadas} aplicada(s) · ${dw.naoCasadas.length} sem par`);
  for (const n of dw.naoCasadas) console.log(`  [SEM PAR] ${n.id} · ${n.produto}: ${n.motivo}`);
  console.log(`Clientes: ${r.clientes.total} · produtos por fase:`, r.clientes.porFase);
  console.log(`Texto corrigido: ${r.textoCorrigido.clientes} cliente(s), ${r.textoCorrigido.eventos} evento(s)`);
  console.log(`Renomeados: ${r.eventosRenomeados} evento(s), ${r.seriesRenomeadas} série(s)`);
  console.log(`ProdutosHistorico: ${r.historico} linha(s) nova(s) · ${r.historicoRemovido.length} removida(s)`);
  for (const h of r.historicoRemovido) {
    console.log(`  [HISTÓRICO REMOVIDO] ${h.clientId} · ${h.produto} · ${h.fase} desde ${h.mudouEm}. Motivo: linha-base suposta refeita pela migração`);
  }
  const { comparados, permitidas, divergencias } = r.relogios;
  console.log(`Relógios comparados: ${comparados} · mudam pela regra do DW: ${permitidas.length} · divergem: ${divergencias.length}`);
  for (const d of permitidas) console.log(`  [DW] ${d.empresa} · ${d.servico}: ${d.antes} -> ${d.depois}`);
  for (const d of divergencias) console.log(`  [DIVERGE] ${d.empresa} · ${d.servico}: ${d.antes} -> ${d.depois}`);
  if (r.maquinasAtrasadas.length) {
    console.log(`Máquinas abaixo da 1.7: ${r.maquinasAtrasadas.map((m) => `${m.maquina} (${m.versao})`).join(', ')}`);
  }
  if (r.copia) console.log(`Cópia do banco: ${r.copia}`);
  if (r.recusa) console.error(`\nNADA GRAVADO. ${r.recusa}`);
  else console.log(r.gravado ? '\nMigração gravada.' : '\nSimulação: nada foi gravado. Use --aplicar para gravar.');
}

async function main() {
  if (isClient) {
    console.error('Rode na máquina servidora (APP_MODE=server): em modo cliente a escrita direta é bloqueada.');
    process.exit(1);
  }
  const aplicar = process.argv.includes('--aplicar');
  const flag = process.argv.find((a) => a.startsWith('--ignorar-maquinas='));
  const ignorarMaquinas = flag ? flag.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean) : [];

  let registroDw;
  if (fs.existsSync(REGISTRO_DW)) {
    registroDw = JSON.parse(fs.readFileSync(REGISTRO_DW, 'utf8'));
  } else if (aplicar) {
    // Sem o registro, os clientes que ganharam produto em 30/10 nasceriam vencidos.
    console.error(`NADA GRAVADO. Registro do DW não encontrado: ${REGISTRO_DW}`);
    process.exit(1);
  } else {
    console.warn(`Aviso: registro do DW não encontrado (${REGISTRO_DW}); simulando sem ele.\n`);
  }

  const aceitarRegistroSemPar = process.argv.includes('--aceitar-registro-sem-par');
  const r = await migrar(repoPlanilha(), { aplicar, registroDw, ignorarMaquinas, aceitarRegistroSemPar, backup: () => copiarBanco() });
  imprimir(r);
  if (r.recusa) process.exit(1);
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { migrar, copiarBanco, maquinasAtrasadas };
