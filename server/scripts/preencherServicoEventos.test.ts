import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { planejar } = require('./preencherServicoEventos.cjs');

const cli = (id: string, servicos: string[]) => ({ id, empresa: id, servicos });
const ev = (id: string, clientId: string, type: string, servicos: unknown = []) => ({ id, clientId, clientName: clientId, type, date: '2026-06-01', servicos });

describe('preencherServicoEventos.planejar', () => {
  const clientes = [cli('so-monit', ['Monitoria', 'Protocolo GPS']), cli('dois', ['Monitoria', 'Precificação'])];

  it('preenche só o que é certo e manda o ambíguo para revisão', () => {
    const { preencher, revisar } = planejar([
      ev('1', 'so-monit', 'Reunião'),
      ev('2', 'dois', 'Contato'),
      ev('3', 'dois', 'Precificação'),
      ev('4', 'dois', 'Relatório'),
      ev('5', 'sumiu', 'Reunião'),
    ], clientes);
    expect(preencher.map((p: { evento: { id: string }; servicos: string[] }) => [p.evento.id, p.servicos])).toEqual([
      ['1', ['Monitoria']], ['3', ['Precificação']], ['4', ['Monitoria']],
    ]);
    expect(revisar.map((r: { evento: { id: string }; motivo: string }) => [r.evento.id, r.motivo])).toEqual([
      ['2', 'cliente tem Monitoria e Price'], ['5', 'cliente removido'],
    ]);
  });

  it('é idempotente: evento que já tem serviço (inclusive string JSON) fica de fora', () => {
    const { preencher, revisar } = planejar([ev('1', 'so-monit', 'Reunião', ['Monitoria']), ev('2', 'dois', 'Contato', '["Precificação"]')], clientes);
    expect(preencher).toHaveLength(0);
    expect(revisar).toHaveLength(0);
  });
});
