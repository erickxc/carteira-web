import { describe, expect, it } from 'vitest';
import { extrairJSON } from './jsonTexto.cjs';

describe('extrairJSON', () => {
  it('passa JSON puro inalterado', () => {
    expect(JSON.parse(extrairJSON('{"a":1}'))).toEqual({ a: 1 });
  });

  it('tira a cerca de código que o modelo insiste em colocar', () => {
    expect(JSON.parse(extrairJSON('```json\n{"a":1}\n```'))).toEqual({ a: 1 });
    expect(JSON.parse(extrairJSON('```\n{"a":1}\n```'))).toEqual({ a: 1 });
  });

  it('descarta prosa em volta (caso típico do Claude CLI, que formata pra humano)', () => {
    expect(JSON.parse(extrairJSON('Aqui está o JSON pedido:\n{"nivelRisco":"alto"}\nEspero que ajude!')))
      .toEqual({ nivelRisco: 'alto' });
  });

  it('preserva chaves internas ao recortar (fecha no último delimitador, não no primeiro)', () => {
    expect(JSON.parse(extrairJSON('texto {"a":{"b":2}} fim'))).toEqual({ a: { b: 2 } });
  });

  it('funciona com array na raiz', () => {
    expect(JSON.parse(extrairJSON('resposta: [1,2,3]'))).toEqual([1, 2, 3]);
  });

  it('texto sem JSON volta como está, pro parse de quem chamou dar o erro claro', () => {
    expect(extrairJSON('não consegui responder')).toBe('não consegui responder');
  });
});
