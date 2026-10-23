import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { descartarEco, formatarTranscricao, lerSegmentos, rotular } from './transcricao.cjs';

describe('transcrição da reunião', () => {
  it('descarta eco do microfone (sem fone, a voz do cliente volta pelo mic)', () => {
    const s = [
      { faixa: 'sistema', pedaco: 1, inicio: 10, fim: 14, texto: 'a gente pode começar pela plataforma' },
      { faixa: 'mic', pedaco: 1, inicio: 11, fim: 15, texto: 'A gente pode começar pela plataforma.' },
      { faixa: 'mic', pedaco: 1, inicio: 20, fim: 22, texto: 'perfeito, vamos lá' },
    ];
    expect(descartarEco(s).map((x) => x.texto)).toEqual(['a gente pode começar pela plataforma', 'perfeito, vamos lá']);
  });

  it('fala do monitor parecida mas longe no tempo não é eco', () => {
    const s = [
      { faixa: 'sistema', pedaco: 1, inicio: 10, fim: 14, texto: 'a gente pode começar pela plataforma' },
      { faixa: 'mic', pedaco: 2, inicio: 40, fim: 44, texto: 'a gente pode começar pela plataforma' },
    ];
    expect(descartarEco(s)).toHaveLength(2);
  });

  it('formata com falante e minuto, em ordem de tempo', () => {
    const r = rotular([
      { faixa: 'sistema', pedaco: 3, inicio: 80, fim: 82, texto: 'Tudo bem' },
      { faixa: 'mic', pedaco: 3, inicio: 75, fim: 78, texto: 'Oi' },
    ], 'Erick Cardoso');
    expect(formatarTranscricao(r)).toBe('[01:15] Erick Cardoso: Oi\n[01:20] Cliente: Tudo bem');
  });

  it('linha malformada no jsonl é ignorada; pasta sem arquivo devolve vazio', () => {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'reuniao-'));
    expect(lerSegmentos(pasta)).toEqual([]);
    fs.writeFileSync(path.join(pasta, 'transcricao.jsonl'),
      '{"faixa":"mic","pedaco":1,"inicio":0,"fim":1,"texto":"a"}\nxx\n{"faixa":"sistema","pedaco":1,"inicio":2,"fim":3,"texto":"b"}\n{"faixa":"mic","pedaco":2,"inic');
    expect(lerSegmentos(pasta).map((s) => s.texto)).toEqual(['a', 'b']);
  });
});
