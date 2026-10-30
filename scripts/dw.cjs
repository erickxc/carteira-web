#!/usr/bin/env node
/**
 * Acesso ao DW_PLATAFORMA (Postgres de PRODUÇÃO de outro sistema) sem ninguém
 * digitar ou colar a senha em conversa/terminal: as credenciais ficam no `.env`
 * desta máquina (fora do git) e este script as lê de lá.
 *
 *   node scripts/dw.cjs                        testa a conexão (não mostra a senha)
 *   node scripts/dw.cjs --sql "select ..."     consulta SOMENTE LEITURA, imprime JSON
 *   node scripts/dw.cjs --configurar           grava as credenciais no .env (senha oculta)
 *
 * Somente leitura sem exceção (mesma regra de `server/dw/dwPlataforma.cjs`): a
 * consulta roda numa transação READ ONLY — o próprio Postgres recusa qualquer
 * INSERT/UPDATE/DELETE/DDL, não depende de alguém lembrar.
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ARQUIVO_ENV = path.join(__dirname, '..', '.env');
const CAMPOS = ['DW_PLATAFORMA_HOST', 'DW_PLATAFORMA_PORT', 'DW_PLATAFORMA_DATABASE', 'DW_PLATAFORMA_USER', 'DW_PLATAFORMA_PASSWORD'];
const LIMITE_LINHAS = 500;

function arg(nome) {
  const i = process.argv.indexOf(`--${nome}`);
  return i === -1 ? undefined : (process.argv[i + 1] ?? '');
}

/** Lê o .env sem depender de `server/config.cjs` (que exige a pasta do OneDrive). */
function lerEnv() {
  const valores = {};
  try {
    for (const linha of fs.readFileSync(ARQUIVO_ENV, 'utf8').split(/\r?\n/)) {
      const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) valores[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* sem .env ainda */ }
  return { ...valores, ...Object.fromEntries(CAMPOS.filter((c) => process.env[c]).map((c) => [c, process.env[c]])) };
}

function pergunta(rl, texto, { oculta = false } = {}) {
  return new Promise((resolve) => {
    if (!oculta) { rl.question(texto, resolve); return; }
    // Senha: não ecoa o que é digitado.
    const escrever = rl._writeToOutput;
    rl._writeToOutput = (s) => { if (s.includes(texto)) escrever.call(rl, s); };
    rl.question(texto, (r) => { rl._writeToOutput = escrever; process.stdout.write('\n'); resolve(r); });
  });
}

async function configurar() {
  const atual = lerEnv();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const novo = {};
  for (const campo of CAMPOS) {
    const oculta = campo.endsWith('PASSWORD');
    const dica = oculta ? (atual[campo] ? ' [Enter mantém a atual]' : '') : (atual[campo] ? ` [${atual[campo]}]` : '');
    const r = (await pergunta(rl, `${campo}${dica}: `, { oculta })).trim();
    novo[campo] = r || atual[campo] || '';
  }
  rl.close();

  let linhas = [];
  try { linhas = fs.readFileSync(ARQUIVO_ENV, 'utf8').split(/\r?\n/); } catch { /* cria */ }
  for (const campo of CAMPOS) {
    const i = linhas.findIndex((l) => l.startsWith(`${campo}=`));
    if (i === -1) linhas.push(`${campo}=${novo[campo]}`); else linhas[i] = `${campo}=${novo[campo]}`;
  }
  fs.writeFileSync(ARQUIVO_ENV, `${linhas.join('\n').replace(/\n+$/, '')}\n`, 'utf8');
  console.log(`Credenciais do DW gravadas em ${ARQUIVO_ENV} (arquivo fora do git).`);
}

async function conectar() {
  const e = lerEnv();
  const faltando = CAMPOS.filter((c) => !e[c]);
  if (faltando.length) throw new Error(`Faltam no .env: ${faltando.join(', ')} — rode: node scripts/dw.cjs --configurar`);
  const { Client } = require('pg');
  const cliente = new Client({
    host: e.DW_PLATAFORMA_HOST, port: Number(e.DW_PLATAFORMA_PORT), database: e.DW_PLATAFORMA_DATABASE,
    user: e.DW_PLATAFORMA_USER, password: e.DW_PLATAFORMA_PASSWORD,
    connectionTimeoutMillis: 8000, statement_timeout: 30000,
  });
  await cliente.connect();
  return cliente;
}

async function consultar(sql) {
  const cliente = await conectar();
  try {
    await cliente.query('BEGIN TRANSACTION READ ONLY');
    const r = await cliente.query(sql);
    await cliente.query('ROLLBACK');
    const linhas = r.rows ?? [];
    console.log(JSON.stringify(linhas.slice(0, LIMITE_LINHAS), null, 2));
    if (linhas.length > LIMITE_LINHAS) console.error(`(${linhas.length} linhas; mostrando ${LIMITE_LINHAS} — use LIMIT/WHERE)`);
  } finally {
    await cliente.end();
  }
}

async function testar() {
  const cliente = await conectar();
  try {
    const { rows: [r] } = await cliente.query('select current_database() as banco, current_user as usuario, now() as agora');
    console.log(`Conectado ao DW: banco ${r.banco}, usuário ${r.usuario}, hora do servidor ${r.agora.toISOString()}.`);
  } finally {
    await cliente.end();
  }
}

(async () => {
  if (process.argv.includes('--configurar')) return configurar();
  const sql = arg('sql');
  if (sql !== undefined) {
    if (!sql.trim()) throw new Error('Informe a consulta: --sql "select ..."');
    return consultar(sql);
  }
  return testar();
})().catch((err) => { console.error(`Erro: ${err.message}`); process.exit(1); });
