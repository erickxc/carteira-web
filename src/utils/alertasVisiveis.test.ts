import { describe, expect, it } from 'vitest';
import { alertasVisiveis } from './alertasVisiveis';

const risco = { tipo: 'risco_sem_pauta' as const, monitor: 'Erick' };
const cert = { tipo: 'certificado' as const, monitor: 'Erick' };

describe('alertasVisiveis', () => {
  it('certificado só para Fiscal e admin; os outros tipos para todos', () => {
    expect(alertasVisiveis([risco, cert], 'Todos', 'fiscal')).toEqual([risco, cert]);
    expect(alertasVisiveis([risco, cert], 'Todos', 'admin')).toEqual([risco, cert]);
    expect(alertasVisiveis([risco, cert], 'Todos', 'negocios')).toEqual([risco]);
    expect(alertasVisiveis([risco, cert], 'Todos', null)).toEqual([risco]);
  });

  it('Negócios com só certificados pendentes fica com a lista vazia (é o que mostra "nenhum alerta")', () => {
    expect(alertasVisiveis([cert, cert], 'Todos', 'negocios')).toEqual([]);
  });

  it('cliente sem monitor: o cartão aparece em "Todos" e some ao escolher um monitor, como os outros tipos', () => {
    const semMonitor = { tipo: 'certificado' as const, monitor: null };
    expect(alertasVisiveis([semMonitor], 'Todos', 'fiscal')).toEqual([semMonitor]);
    expect(alertasVisiveis([semMonitor], 'Erick', 'fiscal')).toEqual([]);
  });

  it('o filtro de monitor vale também para o certificado', () => {
    expect(alertasVisiveis([risco, cert], 'Marco', 'admin')).toEqual([]);
    expect(alertasVisiveis([risco, cert], 'Erick', 'admin')).toEqual([risco, cert]);
  });
});
