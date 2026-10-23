/**
 * Preenche as LOJAS de cada atendimento (nome, CNPJ, endereço) a partir do DW
 * da plataforma (SOMENTE LEITURA lá) — 1.6.8.
 *
 *   node --env-file=.env server/scripts/preencherLojasDoDw.cjs [--base=http://127.0.0.1:3011] [--aplicar]
 *
 * Sem `--aplicar` só mostra o que faria. Grava pela API do servidor (o único
 * escritor do banco), nunca direto no SQLite. Nunca sobrescreve um atendimento
 * que já tem lojas.
 *
 * Regras combinadas com o usuário (22/10/2026):
 *  - O atendimento é a unidade de análise; as lojas são cadastro ("grupos de loja").
 *  - Uma loja: o CNPJ do login do Price é só deste atendimento e existe no DW,
 *    ou o vínculo pelo nome conferido (VINCULO_POR_NOME).
 *  - Grupo de lojas: GRUPOS (CNPJs exatos da Altese; todas as lojas ativas do
 *    DW para WIDMEN, Quality e Gomec).
 *  - Endereço do atendimento só é preenchido quando vazio e há uma loja só.
 */
const { Pool } = require('pg');

const VINCULO_POR_NOME = {
  'Aliança - Itaboraí': '39250147000175',
  'Aliança - Cabo Frio': '39250147000256',
  'C. Braga': '28258036000199',
  'CG. Braga': '08679114000111',
  'Edumar - CBRAGA': '40386625000158',
  'Pecita - Itaguaí': '35774611000171',
  'Pecita - Campo Grande': '35774611000333',
  'Pecita - TOP1000': '35774611000414',
  'Pecita - Seropédica': '35774611000503',
  'Piloto - Matriz': '02694611000102',
  'Piloto - Filial': '02694611000293',
  'Só Fiat': '15524691000108',
};

/** Atendimentos que são grupos de lojas: lista exata de CNPJs, ou `empresa` do DW (todas as ativas). */
const GRUPOS = {
  'Altese - GM, Ford, Fiat, VW': { cnpjs: ['31263577000209', '07503705000170', '31263577000110', '31263577000381', '31263577000462', '31263577000705', '31263577000896'] },
  'Altese - Recreio + Barra': { cnpjs: ['31263577000543', '31263577000624'] },
  WIDMEN: { empresaDw: 'widmen' },
  Quality: { empresaDw: 'quality' },
  Gomec: { empresaDw: 'gomec' },
};

const dig = (s) => String(s || '').replace(/\D/g, '');

function arg(nome, padrao) {
  const a = process.argv.find((x) => x.startsWith(`--${nome}=`));
  return a ? a.slice(nome.length + 3) : padrao;
}

async function lerDw() {
  const e = process.env;
  const pool = new Pool({ host: e.DW_PLATAFORMA_HOST, port: Number(e.DW_PLATAFORMA_PORT || 5432), database: e.DW_PLATAFORMA_DATABASE, user: e.DW_PLATAFORMA_USER, password: e.DW_PLATAFORMA_PASSWORD, max: 1 });
  const c = await pool.connect();
  try {
    await c.query('SET default_transaction_read_only = on');
    const lojas = (await c.query('select empresa, loja, cnpj, ativo from parametro_bi')).rows
      .map((r) => ({ empresa: String(r.empresa || '').trim(), loja: String(r.loja || '').trim(), cnpj: dig(r.cnpj), ativo: r.ativo }))
      .filter((r) => r.cnpj.length === 14);
    const empresas = (await c.query('select cnpj, endereco, cidade, estado, cep from empresas')).rows;
    return { lojasDw: lojas, enderecoPorCnpj: new Map(empresas.map((r) => [dig(r.cnpj), r])) };
  } finally { c.release(); await pool.end(); }
}

function formatarEndereco(r) {
  if (!r || !String(r.endereco || '').trim()) return '';
  const cidade = [r.cidade, r.estado].filter(Boolean).join('/');
  return [String(r.endereco).trim(), cidade, r.cep ? `CEP ${r.cep}` : ''].filter(Boolean).join(', ');
}

/** Decide as lojas de cada atendimento. Pura — testável sem DW nem servidor. */
function planejar(clientes, { lojasDw, enderecoPorCnpj }) {
  const porCnpj = new Map(lojasDw.map((l) => [l.cnpj, l]));
  const loja = (cnpj) => ({ nome: porCnpj.get(cnpj)?.loja || '', cnpj, endereco: formatarEndereco(enderecoPorCnpj.get(cnpj)) });
  const loginCount = {};
  for (const c of clientes) { const d = dig(c.loginPrice); if (d.length === 14) loginCount[d] = (loginCount[d] || 0) + 1; }

  return clientes.map((c) => {
    if (Array.isArray(c.lojasCadastro) && c.lojasCadastro.length) return { c, pula: 'já tem lojas' };
    const grupo = GRUPOS[c.empresa];
    if (grupo) {
      const cnpjs = grupo.cnpjs || lojasDw.filter((l) => l.empresa.toLowerCase() === grupo.empresaDw && l.ativo === 'S').map((l) => l.cnpj);
      return cnpjs.length ? { c, lojas: cnpjs.map(loja), como: `grupo de ${cnpjs.length} lojas` } : { c, pula: 'grupo sem lojas no DW' };
    }
    const login = dig(c.loginPrice);
    let cnpj = VINCULO_POR_NOME[c.empresa] || null;
    let como = 'pelo nome (conferido)';
    if (!cnpj && login.length === 14 && loginCount[login] === 1 && porCnpj.has(login)) { cnpj = login; como = 'login do Price (único)'; }
    if (!cnpj) return { c, pula: 'sem vínculo seguro' };
    const l = loja(cnpj);
    if (!l.nome) l.nome = c.empresa;
    const endereco = !String(c.endereco || '').trim() ? l.endereco : '';
    return { c, lojas: [l], como, endereco };
  });
}

async function main() {
  const base = arg('base', 'http://127.0.0.1:3011');
  const aplicar = process.argv.includes('--aplicar');
  // Servidor anterior à 1.6.8 não conhece a coluna `lojasCadastro`: aceitaria
  // o PUT e descartaria as lojas em silêncio.
  if (aplicar) {
    const { instalada } = await (await fetch(`${base}/api/atualizacao/status`)).json().catch(() => ({}));
    const [ma, mi, pa] = String(instalada || '0.0.0').split('.').map(Number);
    if (ma < 1 || (ma === 1 && (mi < 6 || (mi === 6 && pa < 8)))) {
      throw new Error(`o servidor em ${base} está na versão ${instalada || 'desconhecida'}; atualize para a 1.6.8 antes de gravar.`);
    }
  }
  const clientes = await (await fetch(`${base}/api/clients`)).json();
  const plano = planejar(clientes, await lerDw());
  const grava = plano.filter((p) => p.lojas);
  for (const p of grava) {
    console.log(`${aplicar ? 'GRAVA' : 'simula'}  ${p.c.empresa}  (${p.como})`);
    for (const l of p.lojas) console.log(`         ${l.nome} | ${l.cnpj} | ${l.endereco || 'sem endereço no DW'}`);
  }
  const pulos = {};
  for (const p of plano.filter((x) => x.pula)) (pulos[p.pula] = pulos[p.pula] || []).push(p.c.empresa);
  for (const [motivo, nomes] of Object.entries(pulos)) console.log(`fora (${motivo}): ${nomes.join(', ')}`);
  if (!aplicar) { console.log(`\n${grava.length} atendimentos (${grava.reduce((n, p) => n + p.lojas.length, 0)} lojas) seriam preenchidos. Rode com --aplicar para gravar.`); return; }
  let ok = 0;
  for (const p of grava) {
    const corpo = { lojasCadastro: p.lojas, ...(p.endereco ? { endereco: p.endereco } : {}) };
    const r = await fetch(`${base}/api/clients/${p.c.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    if (r.ok) ok++; else console.error(`falhou ${p.c.empresa}: HTTP ${r.status} ${await r.text()}`);
  }
  console.log(`\n${ok} de ${grava.length} atendimentos gravados.`);
}

if (require.main === module) main().catch((err) => { console.error('ERRO:', err.message); process.exit(1); });

module.exports = { planejar, GRUPOS, VINCULO_POR_NOME };
