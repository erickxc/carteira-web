import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ASSUNTO_AVISO, marcarAvisosDeCancelamento } = require('./avisoCancelamento.cjs');

function repoEmMemoria(agenda: Record<string, unknown>[]) {
  return {
    get: () => agenda,
    save: () => {},
    update: (_s: string, id: string, patch: Record<string, unknown>) => {
      const i = agenda.findIndex((e) => e.id === id);
      agenda[i] = { ...agenda[i], ...patch };
      return agenda[i];
    },
  };
}

describe('marcarAvisosDeCancelamento', () => {
  it('marca só os avisos sem marca e é idempotente', () => {
    const agenda = [
      { id: '1', type: 'Contato', subject: ASSUNTO_AVISO },
      { id: '2', type: 'Contato', subject: 'Tentativa de marcar reunião' },
      { id: '3', type: 'Contato', subject: ASSUNTO_AVISO, motivoContato: 'cancelamento' },
    ];
    const repo = repoEmMemoria(agenda);
    expect(marcarAvisosDeCancelamento(repo)).toBe(1);
    expect(agenda.map((e) => (e as { motivoContato?: string }).motivoContato)).toEqual(['cancelamento', undefined, 'cancelamento']);
    expect(marcarAvisosDeCancelamento(repo)).toBe(0);
  });
});
