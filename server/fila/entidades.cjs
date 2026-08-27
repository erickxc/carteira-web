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

const ENTIDADES = {
  clientes: { sheet: 'Clientes', dominio: clientes },
  agenda: { sheet: 'Agenda', dominio: agenda },
  lembretes: { sheet: 'Lembretes', dominio: lembretes },
  acoes: { sheet: 'Acoes', dominio: acoes },
  modelos: { sheet: 'Modelos', dominio: modelos },
};

module.exports = { ENTIDADES };
