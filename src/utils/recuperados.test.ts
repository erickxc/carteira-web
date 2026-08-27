import { describe, expect, it } from 'vitest';
import { calcularAindaSemAtendimento, calcularRecuperados, LIMIAR_RECUPERACAO_DIAS } from './recuperados';
import type { Cliente, EventoAgenda } from '../types';
import type { Janela } from './periodo';

const NOW = new Date('2026-08-17T12:00:00Z');
const JANELA_TUDO: Janela = { inicio: null, fim: null, descricao: '', curta: '' };

function isoOffset(d: Date, dias: number): string {
  const copia = new Date(d);
  copia.setDate(copia.getDate() + dias);
  return copia.toISOString();
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
    createdAt: isoOffset(NOW, -365),
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
    date: isoOffset(NOW, -10),
    type: 'Reunião',
    subject: 'Reunião',
    description: '',
    servicos: [],
    attachments: [],
    status: 'Concluído',
    monitores: [],
    createdAt: isoOffset(NOW, -10),
    ...overrides,
  };
}

describe('calcularRecuperados', () => {
  it('detecta hiato >= 60 dias entre duas entregas concluídas', () => {
    const antiga = evento({ date: isoOffset(NOW, -100) });
    const recente = evento({ date: isoOffset(NOW, -5) });
    const [rec] = calcularRecuperados([cliente()], [antiga, recente], JANELA_TUDO, NOW);
    expect(rec).toBeDefined();
    expect(rec.diasParado).toBe(95);
    expect(rec.motivo).toBe('hiato');
  });

  it('hiato menor que o limiar não conta como recuperação', () => {
    // Cliente cadastrado perto da 1ª entrega: isola o teste do caminho "nunca"
    // (senão a distância cliente→a, por si só, poderia disparar uma
    // recuperação "nunca atendido" e mascarar o que este teste quer checar).
    const c = cliente({ createdAt: isoOffset(NOW, -40) });
    const a = evento({ date: isoOffset(NOW, -30) });
    const b = evento({ date: isoOffset(NOW, -5) });
    expect(calcularRecuperados([c], [a, b], JANELA_TUDO, NOW)).toHaveLength(0);
  });

  it('primeira entrega da história ("nunca") só conta se o cadastro já passou do limiar', () => {
    const clienteAntigo = cliente({ createdAt: isoOffset(NOW, -100) });
    const primeiraEntrega = evento({ date: isoOffset(NOW, -5) });
    const [rec] = calcularRecuperados([clienteAntigo], [primeiraEntrega], JANELA_TUDO, NOW);
    expect(rec.motivo).toBe('nunca');
    expect(rec.diasParado).toBe(95);

    const clienteNovo = cliente({ id: 'c2', createdAt: isoOffset(NOW, -10) });
    const primeiraEntregaNovo = evento({ clientId: 'c2', date: isoOffset(NOW, -5) });
    expect(calcularRecuperados([clienteNovo], [primeiraEntregaNovo], JANELA_TUDO, NOW)).toHaveLength(0);
  });

  it('ignora entrega apenas AGENDADA (não concluída), mesmo que pareça fechar o hiato', () => {
    // Cliente cadastrado perto de `antiga`: sem isso, `antiga` sozinha (única
    // entrega válida) dispararia uma recuperação "nunca atendido" por conta
    // própria, e o teste não isolaria o comportamento do status "Agendado".
    const c = cliente({ createdAt: isoOffset(NOW, -110) });
    const antiga = evento({ date: isoOffset(NOW, -100) });
    const agendada = evento({ date: isoOffset(NOW, -5), status: 'Agendado' });
    expect(calcularRecuperados([c], [antiga, agendada], JANELA_TUDO, NOW)).toHaveLength(0);
  });

  it('ignora Lembrete (não é entrega) e eventos de outro tipo', () => {
    const c = cliente({ createdAt: isoOffset(NOW, -110) });
    const antiga = evento({ date: isoOffset(NOW, -100) });
    const lembreteTipo = evento({ date: isoOffset(NOW, -5), type: 'Contato' });
    expect(calcularRecuperados([c], [antiga, lembreteTipo], JANELA_TUDO, NOW)).toHaveLength(0);
  });

  it('ignora cliente inativo', () => {
    const inativo = cliente({ estado: 'Inativo' });
    const antiga = evento({ date: isoOffset(NOW, -100) });
    const recente = evento({ date: isoOffset(NOW, -5) });
    expect(calcularRecuperados([inativo], [antiga, recente], JANELA_TUDO, NOW)).toHaveLength(0);
  });

  it('a recuperação precisa cair dentro da janela analisada', () => {
    const antiga = evento({ date: isoOffset(NOW, -200) });
    const recuperacaoForaDaJanela = evento({ date: isoOffset(NOW, -100) });
    const janelaRecente: Janela = { inicio: isoOffsetDate(NOW, -30), fim: null, descricao: '', curta: '' };
    expect(calcularRecuperados([cliente()], [antiga, recuperacaoForaDaJanela], janelaRecente, NOW)).toHaveLength(0);
  });
});

function isoOffsetDate(d: Date, dias: number): Date {
  const copia = new Date(d);
  copia.setDate(copia.getDate() + dias);
  return copia;
}

describe('calcularAindaSemAtendimento', () => {
  it('cliente sem entrega há mais do limiar aparece na lista', () => {
    const antiga = evento({ date: isoOffset(NOW, -100) });
    const [item] = calcularAindaSemAtendimento([cliente()], [antiga], NOW);
    expect(item.diasSemEntrega).toBe(100);
  });

  it('cliente com entrega recente não aparece', () => {
    const recente = evento({ date: isoOffset(NOW, -5) });
    expect(calcularAindaSemAtendimento([cliente()], [recente], NOW)).toHaveLength(0);
  });

  it('cliente nunca atendido só aparece se o cadastro já passou do limiar', () => {
    const antigo = cliente({ createdAt: isoOffset(NOW, -100) });
    const [item] = calcularAindaSemAtendimento([antigo], [], NOW);
    expect(item.diasSemEntrega).toBeNull();

    const novo = cliente({ id: 'c2', createdAt: isoOffset(NOW, -10) });
    expect(calcularAindaSemAtendimento([novo], [], NOW)).toHaveLength(0);
  });

  it('respeita o limiar customizado', () => {
    const a = evento({ date: isoOffset(NOW, -20) });
    expect(calcularAindaSemAtendimento([cliente()], [a], NOW, 10)).toHaveLength(1);
    expect(calcularAindaSemAtendimento([cliente()], [a], NOW, 30)).toHaveLength(0);
  });
});

describe('LIMIAR_RECUPERACAO_DIAS', () => {
  it('é 60 dias', () => {
    expect(LIMIAR_RECUPERACAO_DIAS).toBe(60);
  });
});
