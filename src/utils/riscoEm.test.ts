import { describe, expect, it } from 'vitest';
import { riscoEm } from './riscoEm';
import type { AnaliseIA } from '../types';

const a = (clientId: string, nivelRisco: AnaliseIA['nivelRisco'], geradoEm: string) =>
  ({ id: `${clientId}${geradoEm}`, clientId, nivelRisco, resumo: '', fatores: [], sugestaoProximaPauta: '', geradoEm }) as AnaliseIA;

describe('riscoEm', () => {
  it('usa a análise vigente na data, não a de hoje', () => {
    const atuais = [a('c1', 'alto', '2026-09-20T00:00:00.000Z')];
    const historico = [a('c1', 'baixo', '2026-08-10T00:00:00.000Z')];
    expect(riscoEm(atuais, historico, new Date('2026-08-25T00:00:00.000Z')).get('c1')).toBe('baixo');
    expect(riscoEm(atuais, historico, new Date('2026-09-25T00:00:00.000Z')).get('c1')).toBe('alto');
  });

  it('cliente sem análise até a data fica fora', () => {
    expect(riscoEm([a('c1', 'alto', '2026-09-20T00:00:00.000Z')], [], new Date('2026-08-25T00:00:00.000Z')).has('c1')).toBe(false);
  });
});
