import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { repoMemoria } = require('./repo.cjs');
const series = require('./agendaSeries.cjs');

const payload = {
  clientId: 'c1', clientName: 'Cliente', subject: '', type: 'Relatório', time: '09:00',
  monitores: '[]', servicos: '["Monitoria"]', regra: JSON.stringify({ modo: 'semanal', diasSemana: [1, 2, 3, 4, 5], intervalo: 1 }),
  lembretes: '[]', inicio: '2026-01-01',
};

// Contrato da fila: a máquina cliente calcula a resposta sem efeitos externos
// e com o id já definido; o servidor aplica com o mesmo id e materializa.
describe('dominio/agendaSeries — contrato da fila', () => {
  it('usa o id da operação e não materializa sem efeitos externos', () => {
    const repo = repoMemoria({ AgendaSeries: [], Agenda: [], Lembretes: [], Clientes: [{ id: 'c1', empresa: 'Cliente' }] });
    const nova = series.criar(repo, payload, { id: 's1', efeitosExternos: false });
    expect(nova.id).toBe('s1');
    expect(repo.get('Agenda')).toHaveLength(0);
  });

  it('com efeitos externos (servidor) materializa os eventos do mês', () => {
    const repo = repoMemoria({ AgendaSeries: [], Agenda: [], Lembretes: [], Clientes: [{ id: 'c1', empresa: 'Cliente' }] });
    series.criar(repo, payload, { id: 's1' });
    expect(repo.get('Agenda').length).toBeGreaterThan(0);
    expect(repo.get('Agenda').every((e: { serie: string }) => e.serie === 's1')).toBe(true);
  });
});
