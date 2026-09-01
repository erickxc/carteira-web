import { describe, expect, it } from 'vitest';
import { montarSystemPrompt } from './agente.cjs';

describe('agente: montarSystemPrompt — nota de escopo do filtro de monitor', () => {
  it('sem monitor, não menciona escopo nenhum (comportamento de hoje preservado)', () => {
    const prompt = montarSystemPrompt({});
    expect(prompt).not.toMatch(/filtro global de monitor/);
  });

  it('com monitor, avisa que as ferramentas de carteira já vêm filtradas por ele', () => {
    const prompt = montarSystemPrompt({ monitor: 'Yan' });
    expect(prompt).toContain('o monitor "Yan"');
    expect(prompt).toMatch(/buscar_clientes/);
    expect(prompt).toMatch(/não afirme|deixe claro/);
  });

  it('nota de monitor convive com o contexto de clientId e com a memória geral', () => {
    const prompt = montarSystemPrompt({ clientId: 'c1', monitor: 'Yan', memorias: [{ texto: 'Regra X' }] });
    expect(prompt).toContain('cliente de id "c1"');
    expect(prompt).toContain('o monitor "Yan"');
    expect(prompt).toContain('Regra X');
  });
});
