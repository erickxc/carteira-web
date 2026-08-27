import { describe, expect, it } from 'vitest';
import { sugerirAgenda } from './sugestaoAgenda';
import type { Acao, Cadencias, Cliente, EventoAgenda } from '../types';

const CADENCIAS: Cadencias = {
  reuniao_dias: 30,
  relatorio_dias: 45,
  primeiro_contato_dias: 14,
  esfriando_dias: 45,
  monitoria_dias: 30,
  price_dias: 30,
  recontato_dias: 5,
  peso_contato_recente: 50,
};

// Segunda-feira, sem feriado por perto — evita a suíte quebrar sozinha
// dependendo do dia em que rodar.
const NOW = new Date(2026, 7, 17, 9, 0, 0);

function iso(diasAtras: number, base: Date = NOW): string {
  const d = new Date(base);
  d.setDate(d.getDate() - diasAtras);
  return d.toISOString();
}

function cliente(overrides: Partial<Cliente> = {}): Cliente {
  return {
    id: 'c1',
    empresa: 'Empresa Teste',
    monitor: 'Ana',
    servicos: ['Monitoria'],
    observacao: '',
    estado: 'Ativo',
    status: 'Regular',
    createdAt: iso(365),
    ...overrides,
  };
}

let seq = 0;
function evento(overrides: Partial<EventoAgenda> = {}): EventoAgenda {
  seq++;
  return {
    id: `e${seq}`,
    clientId: 'c1',
    clientName: 'Empresa Teste',
    date: iso(40),
    type: 'Reunião',
    subject: 'Reunião',
    description: '',
    servicos: [],
    attachments: [],
    status: 'Concluído',
    monitores: [],
    createdAt: iso(40),
    ...overrides,
  };
}

const SEM_ACOES: Acao[] = [];

describe('sugerirAgenda', () => {
  it('sugere apenas clientes que precisam de ação (vencido/vencendo/nunca)', () => {
    const nuncaAtendido = cliente({ id: 'c1' });
    const emDia = cliente({ id: 'c2', empresa: 'Em dia' });
    const reuniaoRecente = evento({ clientId: 'c2', date: iso(5) });
    const sugestoes = sugerirAgenda([nuncaAtendido, emDia], [reuniaoRecente], SEM_ACOES, CADENCIAS, { agora: NOW });
    expect(sugestoes.some((s) => s.cliente.id === 'c1')).toBe(true);
    expect(sugestoes.some((s) => s.cliente.id === 'c2')).toBe(false);
  });

  it('não sugere cliente que já tem reunião futura marcada (já está coberto)', () => {
    const c = cliente();
    const futura = evento({ date: iso(-5) }); // futuro
    const sugestoes = sugerirAgenda([c], [futura], SEM_ACOES, CADENCIAS, { agora: NOW });
    expect(sugestoes).toHaveLength(0);
  });

  it('só sugere dias úteis', () => {
    const c = cliente();
    const sugestoes = sugerirAgenda([c], [], SEM_ACOES, CADENCIAS, { agora: NOW });
    expect(sugestoes.length).toBeGreaterThan(0);
    for (const s of sugestoes) {
      expect(s.dia.getDay()).not.toBe(0);
      expect(s.dia.getDay()).not.toBe(6);
    }
  });

  it('não sugere horário já ocupado por reunião do mesmo monitor', () => {
    const c = cliente({ monitor: 'Ana' });
    // Ocupa amanhã 09:00 para o monitor Ana.
    const amanha = new Date(NOW);
    amanha.setDate(amanha.getDate() + 1);
    const ocupacao = evento({ clientId: 'outro', date: amanha.toISOString(), time: '09:00', monitores: ['Ana'] });
    const sugestoes = sugerirAgenda([c], [ocupacao], SEM_ACOES, CADENCIAS, { agora: NOW, dias: 1 });
    expect(sugestoes.every((s) => s.hora !== '09:00')).toBe(true);
  });

  it('reunião CANCELADA não ocupa o horário', () => {
    const c = cliente({ monitor: 'Ana' });
    const amanha = new Date(NOW);
    amanha.setDate(amanha.getDate() + 1);
    const canceladaNoMesmoHorario = evento({ clientId: 'outro', date: amanha.toISOString(), time: '09:00', monitores: ['Ana'], status: 'Cancelado' });
    const sugestoes = sugerirAgenda([c], [canceladaNoMesmoHorario], SEM_ACOES, CADENCIAS, { agora: NOW, dias: 1 });
    expect(sugestoes.some((s) => s.hora === '09:00')).toBe(true);
  });

  it('respeita o teto de sugestões por dia por monitor', () => {
    const clientes = Array.from({ length: 5 }, (_, i) => cliente({ id: `c${i}`, monitor: 'Ana' }));
    const sugestoes = sugerirAgenda(clientes, [], SEM_ACOES, CADENCIAS, { agora: NOW, dias: 1, max: 10 });
    // Só 1 dia útil disponível (dias: 1) e teto de 2 por dia por monitor.
    expect(sugestoes.length).toBeLessThanOrEqual(2);
  });

  it('respeita o teto máximo de sugestões (opção `max`)', () => {
    const clientes = Array.from({ length: 10 }, (_, i) => cliente({ id: `c${i}`, monitor: `Monitor ${i}` }));
    const sugestoes = sugerirAgenda(clientes, [], SEM_ACOES, CADENCIAS, { agora: NOW, max: 3 });
    expect(sugestoes).toHaveLength(3);
  });

  it('o motivo/serviço refletem o relógio mais atrasado do cliente', () => {
    const c = cliente({ servicos: ['Monitoria', 'Price'] });
    const monitoriaEmDia = evento({ servicos: ['Monitoria'], date: iso(5) });
    const sugestoes = sugerirAgenda([c], [monitoriaEmDia], SEM_ACOES, CADENCIAS, { agora: NOW });
    expect(sugestoes[0].servico).toBe('Price'); // Price nunca atendido é mais urgente que Monitoria em dia
  });
});
