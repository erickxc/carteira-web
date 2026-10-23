import { describe, expect, it, vi } from 'vitest';
import { criarCicloInsights, montarPromptInsights } from './insights.cjs';
import { repoMemoria } from '../dominio/repo.cjs';

// Relógio controlado: as regras de "pauta só na 2ª metade" e "1 aviso a cada
// 2 min" dependem de tempo. O dossiê é injetado — o real lê o OneDrive.
function montar({ respostas = [] as unknown[], duracao = 60, clientId = 'c1' } = {}) {
  let t = 0;
  const llm = { gerarJSON: vi.fn(async () => respostas.shift() ?? { resumo: '', insights: [] }) };
  const notificar = vi.fn();
  const aoInvestigar = vi.fn();
  const repo = repoMemoria({ Clientes: [{ id: 'c1', empresa: 'Pecita' }], AnalisesIA: [], UsoIA: [] });
  const ciclo = criarCicloInsights({
    repo, evento: { id: 'e1', clientId, subject: 'Reunião mensal', duracao }, llm, notificar, aoInvestigar,
    agora: () => t, lerDossie: () => 'dossiê de teste',
  });
  return { ciclo, llm, notificar, aoInvestigar, avancar: (min: number) => { t += min * 60_000; } };
}

const ins = (tipo: string, chave: string, texto = chave) => ({ tipo, texto, chave });

describe('ciclo de insights da reunião', () => {
  it('não chama o LLM sem trecho novo', async () => {
    const m = montar();
    await m.ciclo.rodar('');
    expect(m.llm.gerarJSON).not.toHaveBeenCalled();
  });

  it('mesma chave avisa uma vez', async () => {
    const m = montar({ respostas: [{ resumo: 'r', insights: [ins('risco', 'margem')] }, { resumo: 'r', insights: [ins('risco', 'margem')] }] });
    await m.ciclo.rodar('a');
    m.avancar(5);
    await m.ciclo.rodar('b');
    expect(m.notificar).toHaveBeenCalledTimes(1);
  });

  it('pauta antes da metade do tempo é descartada; depois, aceita', async () => {
    const m = montar({ respostas: [{ resumo: 'r', insights: [ins('pauta', 'gps')] }, { resumo: 'r', insights: [ins('pauta', 'gps')] }] });
    m.avancar(10);
    await m.ciclo.rodar('a');
    expect(m.ciclo.enviados()).toEqual([]);
    m.avancar(25);
    await m.ciclo.rodar('b');
    expect(m.ciclo.enviados().map((i: { chave: string }) => i.chave)).toEqual(['gps']);
  });

  it('dois no mesmo ciclo: um por notificação, o segundo no despacho seguinte', async () => {
    const m = montar({ respostas: [{ resumo: 'r', insights: [ins('risco', 'a', 'A'), ins('compromisso', 'b', 'B')] }] });
    await m.ciclo.rodar('x');
    expect(m.notificar).toHaveBeenCalledTimes(1);
    expect(m.notificar).toHaveBeenCalledWith({ titulo: 'Risco · Pecita', mensagem: 'A' });
    m.avancar(2);
    m.ciclo.despachar();
    expect(m.notificar).toHaveBeenLastCalledWith({ titulo: 'Compromisso · Pecita', mensagem: 'B' });
  });

  it('dentro de 2 min fica guardado e sai no despacho seguinte', async () => {
    const m = montar({ respostas: [{ resumo: 'r', insights: [ins('risco', 'a', 'A')] }, { resumo: 'r', insights: [ins('risco', 'b', 'B')] }] });
    await m.ciclo.rodar('x');
    m.avancar(1);
    await m.ciclo.rodar('y');
    expect(m.notificar).toHaveBeenCalledTimes(1);
    m.avancar(1.5);
    m.ciclo.despachar();
    expect(m.notificar).toHaveBeenCalledTimes(2);
    expect(m.notificar).toHaveBeenLastCalledWith(expect.objectContaining({ mensagem: 'B' }));
  });

  it('repassa ação e fontes para a notificação', () => {
    const m = montar();
    m.ciclo.adicionar({ tipo: 'analise', chave: 'kit', texto: 'Queda de 18%', acao: 'Pergunte do preço', fontes: 'alvos.json' });
    expect(m.notificar).toHaveBeenCalledWith({ titulo: 'Análise · Pecita', mensagem: 'Queda de 18%', acao: 'Pergunte do preço', fontes: 'alvos.json' });
  });

  it('item crítico é repassado para investigação', async () => {
    const m = montar({ respostas: [{ resumo: 'r', insights: [], investigar: [{ chave: 'cancelar', oQueDisse: 'vamos cancelar', porque: 'risco' }] }] });
    await m.ciclo.rodar('x');
    expect(m.aoInvestigar).toHaveBeenCalledWith(expect.objectContaining({ chave: 'cancelar' }));
  });

  it('insight vindo de fora (investigação) passa pelas mesmas regras', () => {
    const m = montar();
    m.ciclo.adicionar(ins('analise', 'kit', 'Kit: queda é de preço'));
    m.ciclo.adicionar(ins('analise', 'kit', 'repetido'));
    expect(m.notificar).toHaveBeenCalledTimes(1);
  });

  it('LLM falhando não lança', async () => {
    const m = montar();
    m.llm.gerarJSON.mockRejectedValueOnce(new Error('fora'));
    await expect(m.ciclo.rodar('oi')).resolves.toBeUndefined();
  });

  it('prompt pede texto detalhado: o que foi dito, por que importa, o que fazer', () => {
    const p = montarPromptInsights({ evento: { subject: 'X' }, trechoNovo: 'x', jaEnviados: [], podePauta: true });
    expect(p).toMatch(/"texto" com até 220 caracteres/);
    expect(p).toMatch(/"acao" com até 120 caracteres/);
    expect(p).toMatch(/o que fazer agora/i);
  });

  it('evento sem cliente monta prompt sem dossiê e proíbe pauta quando pedido', () => {
    const p = montarPromptInsights({ evento: { subject: 'Interna' }, trechoNovo: 'x', jaEnviados: [], podePauta: false });
    expect(p).toContain('Interna');
    expect(p).toMatch(/não use o tipo "pauta"/i);
  });
});
