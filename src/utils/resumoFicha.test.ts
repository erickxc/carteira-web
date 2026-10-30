import { describe, expect, it } from 'vitest';
import { gerarAta, type AtaSecoesIA } from './ata';
import { resumoDaConversa, resumoFicha } from './resumoFicha';
import type { Acao, Cadencias, Cliente, EventoAgenda } from '../types';

const CADENCIAS = { monitoria_dias: 30, price_dias: 30 } as Cadencias;
const HOJE = new Date(2026, 9, 30, 12);

/** Data como o app grava: meia-noite local, `dias` a partir de HOJE. */
function dia(dias: number): string {
  return new Date(2026, 9, 30 + dias).toISOString();
}

function cliente(over: Partial<Cliente> = {}): Cliente {
  return {
    id: 'c1',
    empresa: 'Loja 1',
    monitor: 'Ana',
    servicos: [],
    observacao: '',
    estado: 'Ativo',
    status: 'Regular',
    createdAt: dia(-365),
    ...over,
  } as Cliente;
}

function evento(id: string, dias: number, status: string, over: Partial<EventoAgenda> = {}): EventoAgenda {
  return { id, clientId: 'c1', clientName: 'Loja 1', date: dia(dias), type: 'Reunião', subject: id, description: '', servicos: [], status, ...over } as EventoAgenda;
}

describe('resumoFicha', () => {
  it('cliente sem nada: prazos vazios, sem última nem próxima', () => {
    const c = cliente();
    expect(resumoFicha(c, [c], [], [], CADENCIAS, HOJE)).toEqual({ prazos: [], ultima: null, proxima: null });
  });

  it('última = concluído mais recente, ignorando cancelado, futuro e outro cliente', () => {
    const c = cliente();
    const agenda = [
      evento('antiga', -40, 'Concluído'),
      evento('recente', -5, 'Realizada'),
      evento('cancelada', -1, 'Cancelado'),
      evento('futura', 3, 'Concluído'),
      evento('outro', -2, 'Concluído', { clientId: 'c2' }),
    ];
    expect(resumoFicha(c, [c], agenda, [], CADENCIAS, HOJE).ultima?.id).toBe('recente');
  });

  it('próxima = a mais perto a partir de hoje; hoje e Pendente contam, cancelado/reagendado não', () => {
    const c = cliente();
    const base = [evento('ontem', -1, 'Agendado'), evento('cancelada', 0, 'Cancelado'), evento('reagendada', 0, 'Reagendado'), evento('concluida', 0, 'Concluído')];
    const pendente = evento('pendente', 2, 'Pendente');
    expect(resumoFicha(c, [c], [...base, evento('longe', 9, 'Agendado'), pendente], [], CADENCIAS, HOJE).proxima?.id).toBe('pendente');
    expect(resumoFicha(c, [c], [...base, pendente, evento('hoje', 0, 'Agendado')], [], CADENCIAS, HOJE).proxima?.id).toBe('hoje');
  });

  it('próxima no mesmo dia: vale a hora mais cedo', () => {
    const c = cliente();
    const agenda = [evento('tarde', 1, 'Agendado', { time: '15:00' }), evento('manha', 1, 'Agendado', { time: '09:00' })];
    expect(resumoFicha(c, [c], agenda, [], CADENCIAS, HOJE).proxima?.id).toBe('manha');
  });

  it('precificação salva na loja-irmã conta como última conversa e no prazo do 2D Price desta loja', () => {
    const c = cliente({ grupo: 'Rede', servicos: ['2D Price'] } as Partial<Cliente>);
    const irma = cliente({ id: 'c2', empresa: 'Loja 2', grupo: 'Rede' } as Partial<Cliente>);
    const preco = evento('preco', -10, 'Concluído', { clientId: 'c2', clientName: 'Loja 2', type: 'Precificação', servicos: ['2D Price'] });
    const r = resumoFicha(c, [c, irma], [preco], [], CADENCIAS, HOJE);
    expect(r.ultima?.doGrupo?.origemId).toBe('preco');
    expect(r.prazos).toEqual([{ servico: '2D Price', independente: false, atraso: -20, status: 'em_dia', proximo: null }]);
  });

  it('ação de Price concluída na loja-irmã conta no prazo, como na fila', () => {
    const c = cliente({ grupo: 'Rede', servicos: ['2D Price'] } as Partial<Cliente>);
    const irma = cliente({ id: 'c2', empresa: 'Loja 2', grupo: 'Rede' } as Partial<Cliente>);
    const acao = { id: 'a1', clientId: 'c2', tipo: 'price', status: 'concluido', dueAt: dia(-10) } as Acao;
    expect(resumoFicha(c, [c, irma], [], [acao], CADENCIAS, HOJE).prazos[0].atraso).toBe(-20);
  });

  it('prazo coberto por reunião marcada mostra os dias reais, não o peso interno da fila', () => {
    const c = cliente({ servicos: ['Plataforma 2D'] });
    const agenda = [evento('feita', -40, 'Concluído', { servicos: ['Plataforma 2D'] }), evento('marcada', 5, 'Agendado', { servicos: ['Plataforma 2D'] })];
    const [prazo] = resumoFicha(c, [c], agenda, [], CADENCIAS, HOJE).prazos;
    expect(prazo.atraso).toBe(10);
    expect(prazo.proximo).not.toBeNull();
  });

  it('serviço independente entra marcado, sem atraso', () => {
    const c = cliente({ servicos: ['Plataforma 2D', '2D Price'], servicosIndependentes: ['2D Price'] });
    const r = resumoFicha(c, [c], [evento('feita', -10, 'Concluído', { servicos: ['Plataforma 2D'] })], [], CADENCIAS, HOJE);
    expect(r.prazos).toEqual([
      { servico: 'Plataforma 2D', independente: false, atraso: -20, status: 'em_dia', proximo: null },
      { servico: '2D Price', independente: true, atraso: null, status: null, proximo: null },
    ]);
  });
});

describe('resumoFicha: casos de borda', () => {
  const lojaDaRede = (over: Partial<Cliente> = {}) => cliente({ grupo: 'Rede', ...over } as Partial<Cliente>);
  const irma = cliente({ id: 'c2', empresa: 'Loja 2', grupo: 'Rede' } as Partial<Cliente>);
  const naIrma = { clientId: 'c2', clientName: 'Loja 2', type: 'Precificação', servicos: ['2D Price'] } as Partial<EventoAgenda>;

  it('precificação "só esta loja" na irmã não conta como última, próxima nem prazo', () => {
    const c = lojaDaRede({ servicos: ['2D Price'] });
    const agenda = [
      evento('feita', -10, 'Concluído', { ...naIrma, escopoPrice: 'loja' }),
      evento('marcada', 3, 'Agendado', { ...naIrma, escopoPrice: 'loja' }),
    ];
    const r = resumoFicha(c, [c, irma], agenda, [], CADENCIAS, HOJE);
    expect(r.ultima).toBeNull();
    expect(r.proxima).toBeNull();
    expect(r.prazos[0].atraso).toBe(335); // sem toque: conta desde o cadastro
    expect(r.prazos[0].proximo).toBeNull();
  });

  it('precificação agendada na irmã é a próxima desta loja e cobre o prazo; cancelada não', () => {
    const c = lojaDaRede({ servicos: ['2D Price'] });
    const marcada = resumoFicha(c, [c, irma], [evento('marcada', 3, 'Agendado', naIrma)], [], CADENCIAS, HOJE);
    expect(marcada.proxima?.doGrupo?.origemId).toBe('marcada');
    expect(marcada.prazos[0].proximo).not.toBeNull();

    const cancelada = resumoFicha(c, [c, irma], [evento('cancelada', 3, 'Cancelado', naIrma)], [], CADENCIAS, HOJE);
    expect(cancelada.proxima).toBeNull();
    expect(cancelada.prazos[0].proximo).toBeNull();
  });

  it('entrega da irmã com Plataforma 2D e 2D Price não mexe no prazo da Plataforma desta loja', () => {
    const c = lojaDaRede({ servicos: ['Plataforma 2D', '2D Price'] });
    const feita = evento('feita', -10, 'Concluído', { ...naIrma, type: 'Reunião', servicos: ['Plataforma 2D', '2D Price'] });
    expect(resumoFicha(c, [c, irma], [feita], [], CADENCIAS, HOJE).prazos).toEqual([
      { servico: 'Plataforma 2D', independente: false, atraso: 335, status: 'nunca', proximo: null },
      { servico: '2D Price', independente: false, atraso: -20, status: 'em_dia', proximo: null },
    ]);
  });

  it('reunião comum da irmã não aparece na ficha desta loja', () => {
    const c = lojaDaRede();
    const agenda = [evento('feita', -5, 'Concluído', { clientId: 'c2' }), evento('marcada', 5, 'Agendado', { clientId: 'c2' })];
    const r = resumoFicha(c, [c, irma], agenda, [], CADENCIAS, HOJE);
    expect(r.ultima).toBeNull();
    expect(r.proxima).toBeNull();
  });

  it('cliente inativo ou pausado: sem prazo com relógio, mas o independente e as reuniões seguem', () => {
    const agenda = [evento('feita', -5, 'Concluído', { servicos: ['Plataforma 2D'] }), evento('marcada', 5, 'Agendado')];
    const servicos = { servicos: ['Plataforma 2D', '2D Price'], servicosIndependentes: ['2D Price'] };
    for (const c of [cliente({ ...servicos, estado: 'Inativo' }), cliente({ ...servicos, pausadoAte: dia(10) })]) {
      const r = resumoFicha(c, [c], agenda, [], CADENCIAS, HOJE);
      expect(r.prazos).toEqual([{ servico: '2D Price', independente: true, atraso: null, status: null, proximo: null }]);
      expect(r.ultima?.id).toBe('feita');
      expect(r.proxima?.id).toBe('marcada');
    }
  });

  it('nome antigo do serviço cai no relógio de nome novo', () => {
    const c = cliente({ servicos: ['Monitoria', 'Price'], servicosIndependentes: ['Price'] });
    const [plataforma, price, ...resto] = resumoFicha(c, [c], [], [], CADENCIAS, HOJE).prazos;
    expect(plataforma).toMatchObject({ servico: 'Plataforma 2D', independente: false, atraso: 335 });
    expect(price).toEqual({ servico: '2D Price', independente: true, atraso: null, status: null, proximo: null });
    expect(resto).toEqual([]);
  });

  it('sem toque: status "nunca", inclusive no legado sem data de cadastro, onde o atraso sai negativo', () => {
    const legado = cliente({ servicos: ['Plataforma 2D'], createdAt: undefined } as Partial<Cliente>);
    expect(resumoFicha(legado, [legado], [], [], CADENCIAS, HOJE).prazos[0]).toMatchObject({ status: 'nunca', atraso: -30 });
    const antigo = cliente({ servicos: ['Plataforma 2D'] });
    expect(resumoFicha(antigo, [antigo], [], [], CADENCIAS, HOJE).prazos[0]).toMatchObject({ status: 'nunca', atraso: 335 });
  });

  it('produto sem relógio não vira prazo; produto com prazo futuro também não', () => {
    const c = cliente({ servicos: ['Controladoria', 'Apura'] });
    expect(resumoFicha(c, [c], [], [], CADENCIAS, HOJE).prazos).toEqual([]);
    const futuro = cliente({ servicos: ['Plataforma 2D'], produtos: [{ produto: 'Plataforma 2D', fase: 'Ativo', faseDesde: dia(5) }] } as Partial<Cliente>);
    expect(resumoFicha(futuro, [futuro], [], [], CADENCIAS, HOJE).prazos).toEqual([]);
  });

  it('última no mesmo dia: vale a hora mais tarde; concluído de hoje conta', () => {
    const c = cliente();
    const agenda = [evento('cedo', 0, 'Concluído', { time: '09:00' }), evento('tarde', 0, 'Realizada', { time: '16:00' }), evento('ontem', -1, 'Concluído', { time: '23:00' })];
    expect(resumoFicha(c, [c], agenda, [], CADENCIAS, HOJE).ultima?.id).toBe('tarde');
  });

  it('virada do dia: hoje à meia-noite e às 23:59 dão a mesma resposta', () => {
    const c = cliente();
    const agenda = [evento('hoje', 0, 'Agendado'), evento('ontem', -1, 'Concluído')];
    for (const agora of [new Date(2026, 9, 30, 0, 0), new Date(2026, 9, 30, 23, 59)]) {
      const r = resumoFicha(c, [c], agenda, [], CADENCIAS, agora);
      expect(r.proxima?.id).toBe('hoje');
      expect(r.ultima?.id).toBe('ontem');
    }
  });

  it('evento com data vazia não quebra a ficha nem vira última/próxima', () => {
    const c = cliente({ servicos: ['Plataforma 2D'] });
    const agenda = [evento('vazia', 0, 'Concluído', { date: '' })];
    const r = resumoFicha(c, [c], agenda, [], CADENCIAS, HOJE);
    expect(r.ultima).toBeNull();
    expect(r.proxima).toBeNull();
  });

  it('não altera a ordem da agenda recebida', () => {
    const c = cliente();
    const agenda = [evento('b', 5, 'Agendado'), evento('a', 1, 'Agendado')];
    resumoFicha(c, [c], agenda, [], CADENCIAS, HOJE);
    expect(agenda.map((a) => a.id)).toEqual(['b', 'a']);
  });
});

// Spec, bloco Reuniões: "mesmo critério de 'próximo' de useDashboardData", que tira relatório.
describe('resumoFicha: próxima reunião e relatório automático', () => {
  it('relatório mais perto não esconde a reunião marcada', () => {
    const c = cliente();
    const agenda = [evento('relatorio', 1, 'Agendado', { type: 'Relatório' }), evento('reuniao', 5, 'Agendado')];
    expect(resumoFicha(c, [c], agenda, [], CADENCIAS, HOJE).proxima?.id).toBe('reuniao');
  });

  it('só relatório marcado: nenhuma reunião marcada', () => {
    const c = cliente();
    expect(resumoFicha(c, [c], [evento('relatorio', 1, 'Agendado', { type: 'Relatório' })], [], CADENCIAS, HOJE).proxima).toBeNull();
  });
});

describe('resumoDaConversa: a linha nunca é o título da ata', () => {
  const ev = (ata: string) => ({ id: 'e', ata }) as EventoAgenda;
  const TITULO = /^ATA\b/;

  it('ata do gerador atual: lê a seção de resumo', () => {
    const ata = gerarAta({ type: 'Reunião', clientName: 'Pecita', date: dia(-3), subject: 'Margem' }, {}, { oQueFoiTratado: 'Margem subiu no trimestre\nOutra linha' } as AtaSecoesIA);
    expect(resumoDaConversa(ev(ata))).toBe('Margem subiu no trimestre');
  });

  it('ata do gerador atual ainda em branco: vazio', () => {
    expect(resumoDaConversa(ev(gerarAta({ type: 'Relatório', clientName: 'Pecita', date: dia(-3) })))).toBe('');
  });

  it('ata salva com quebra de linha do Windows', () => {
    expect(resumoDaConversa(ev('ATA DE REUNIÃO — Pecita\r\n\r\n1. RESUMO\r\n   Margem subiu\r\n\r\n2. O QUE FOI TRATADO\r\n'))).toBe('Margem subiu');
  });

  // Falham até corrigir resumoDaConversa. Sem a seção "1. RESUMO" preenchida ela
  // cai em primeiraLinha, que numa ata gerada é o próprio título.
  it('ata antiga (antes de 02/09/2026, seção "1. PAUTA") não mostra o título', () => {
    const ata = 'ATA DE REUNIÃO — Pecita\n12/08/2026 · 14:00\nMonitor: Erick\n\n1. PAUTA\n   (sem pauta registrada)\n\n2. O QUE FOI TRATADO\n   Margem subiu\n';
    expect(resumoDaConversa(ev(ata))).not.toMatch(TITULO);
  });

  it('ata antiga de outro tipo de entrega também não', () => {
    expect(resumoDaConversa(ev('ATA — RELATÓRIO — Pecita\n12/08/2026\n\n1. PAUTA\n   (sem pauta registrada)\n'))).not.toMatch(TITULO);
  });

  it('sem resumo, a linha vem de "O que foi tratado"; marcador e cabeçalho vizinho não valem', () => {
    const fim = '2. O QUE FOI TRATADO\n   Margem subiu\n';
    expect(resumoDaConversa(ev(`ATA DE REUNIÃO — Pecita\n\n1. PAUTA\n   (sem pauta registrada)\n\n${fim}`))).toBe('Margem subiu');
    expect(resumoDaConversa(ev(`ATA DE REUNIÃO — Pecita\n\n1. RESUMO\n   (a preencher)\n\n${fim}`))).toBe('Margem subiu');
    expect(resumoDaConversa(ev(`ATA DE REUNIÃO — Pecita\n\n1. RESUMO\n${fim}`))).toBe('Margem subiu');
  });

  it('ata escrita à mão continua na primeira linha, mesmo começando com a palavra ata', () => {
    expect(resumoDaConversa(ev('Cliente pediu desconto\nOutra linha'))).toBe('Cliente pediu desconto');
    expect(resumoDaConversa(ev('Ata curta: cliente pediu desconto'))).toBe('Ata curta: cliente pediu desconto');
  });

  it('seção de resumo apagada à mão não mostra o título', () => {
    expect(resumoDaConversa(ev('ATA DE REUNIÃO — Pecita\n\n1. RESUMO\n\n2. O QUE FOI TRATADO\n   Algo\n'))).not.toMatch(TITULO);
  });
});
