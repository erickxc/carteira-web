/**
 * Entidades que passam pela fila (Etapa 3+) — mapeia o nome usado na operação
 * (`entity`) pra sheet real + módulo de domínio correspondente. Cadências e
 * Categorias ficam DE FORA de propósito (decisão do plano, item 6): são
 * config global rara, sem `recordId` natural — somente leitura no modo cliente.
 */
const clientes = require('../dominio/clientes.cjs');
const agenda = require('../dominio/agenda.cjs');
const lembretes = require('../dominio/lembretes.cjs');
const acoes = require('../dominio/acoes.cjs');
const modelos = require('../dominio/modelos.cjs');
const acoesIA = require('../dominio/acoesIA.cjs');
const usoIA = require('../dominio/usoIA.cjs');
const memoriaIA = require('../dominio/memoriaIA.cjs');

const ENTIDADES = {
  clientes: { sheet: 'Clientes', dominio: clientes },
  agenda: { sheet: 'Agenda', dominio: agenda },
  lembretes: { sheet: 'Lembretes', dominio: lembretes },
  acoes: { sheet: 'Acoes', dominio: acoes },
  modelos: { sheet: 'Modelos', dominio: modelos },
  // Escritas do agente de IA. Entraram depois (bug real: em APP_MODE=client
  // toda pergunta ao monitorIA quebrava com "escrita direta no SQLite
  // bloqueada", porque estas três escreviam via repo.save direto, fora da
  // fila). `acoesIA`/`usoIA` são append-only; `memoriaIA` é editável.
  acoesIA: { sheet: 'AcoesIA', dominio: acoesIA },
  usoIA: { sheet: 'UsoIA', dominio: usoIA },
  memoriaIA: { sheet: 'MemoriaIA', dominio: memoriaIA },
};

module.exports = { ENTIDADES };
