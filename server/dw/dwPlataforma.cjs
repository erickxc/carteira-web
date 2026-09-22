/**
 * Cliente Postgres pro `DW_PLATAFORMA` — banco de PRODUÇÃO de outro sistema
 * (não desta Carteira), único consumidor: `sincronizarPrice.cjs`.
 *
 * SOMENTE LEITURA, sem exceção: nenhuma função aqui roda INSERT/UPDATE/DELETE
 * — é dado de outro sistema, mexer nele está fora de escopo (e fora de
 * cogitação) deste projeto. Se um dia isso mudar, precisa de decisão
 * explícita, não uma query solta aqui.
 *
 * Pool pequeno e sob demanda (não fica conectado o tempo todo): a
 * sincronização roda 1x por ciclo de cron, não é tráfego constante.
 */
const { Pool } = require('pg');
const {
  DW_PLATAFORMA_HOST, DW_PLATAFORMA_PORT, DW_PLATAFORMA_DATABASE,
  DW_PLATAFORMA_USER, DW_PLATAFORMA_PASSWORD, DW_PLATAFORMA_CONFIGURADO,
} = require('../config.cjs');

let pool = null;
function conectar() {
  if (!DW_PLATAFORMA_CONFIGURADO) throw new Error('DW_PLATAFORMA não configurado (faltam DW_PLATAFORMA_* no .env).');
  if (!pool) {
    pool = new Pool({
      host: DW_PLATAFORMA_HOST,
      port: DW_PLATAFORMA_PORT,
      database: DW_PLATAFORMA_DATABASE,
      user: DW_PLATAFORMA_USER,
      password: DW_PLATAFORMA_PASSWORD,
      max: 2,
      connectionTimeoutMillis: 8000,
      statement_timeout: 15000,
    });
  }
  return pool;
}

/**
 * Login/senha (tabela `usuarios`, cnpj = login) + segmento/linha da loja
 * (tabela `parametro_bi`, mesma chave) — pra cada CNPJ (só dígitos) da
 * lista. Um único round-trip pros dois, não um por CNPJ.
 */
async function buscarDadosPrice(cnpjsDigitos) {
  if (cnpjsDigitos.length === 0) return new Map();
  const db = conectar();
  const [resUsuarios, resParametro] = await Promise.all([
    db.query('SELECT cnpj, senha, ativo FROM usuarios WHERE cnpj = ANY($1)', [cnpjsDigitos]),
    db.query(
      "SELECT regexp_replace(cnpj, '[^0-9]', '', 'g') AS cnpj_digitos, segmento, segmento_harmonizacao "
      + 'FROM parametro_bi WHERE regexp_replace(cnpj, \'[^0-9]\', \'\', \'g\') = ANY($1)',
      [cnpjsDigitos],
    ),
  ]);

  const resultado = new Map();
  for (const row of resUsuarios.rows) {
    resultado.set(row.cnpj, { senha: row.senha, loginAtivo: row.ativo });
  }
  for (const row of resParametro.rows) {
    const atual = resultado.get(row.cnpj_digitos) || {};
    atual.segmento = row.segmento?.trim() || null;
    atual.segmentoHarmonizacao = row.segmento_harmonizacao?.trim() || null;
    resultado.set(row.cnpj_digitos, atual);
  }
  return resultado;
}

module.exports = { buscarDadosPrice };
