import { describe, expect, it } from 'vitest';
import {
  buildFilaCadencia,
  buildVencendoDashboard,
  classificarCadencia,
  contatoRecenteNaoRefletido,
  rotuloRelogio,
  type FilaCadItem,
  type RelogioServico,
} from './cadenciaServico';
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

const NOW = new Date('2026-08-17T12:00:00Z');

function iso(diasAtras: number): string {
  const d = new Date(NOW);
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

function evento(overrides: Partial<EventoAgenda> = {}): EventoAgenda {
  return {
    id: 'e1',
    clientId: 'c1',
    clientName: 'Empresa Teste',
    date: iso(10),
    type: 'Reunião',
    subject: 'Reunião de monitoria',
    description: '',
    servicos: ['Monitoria'],
    attachments: [],
    status: 'Concluído',
    monitores: [],
    createdAt: iso(10),
    ...overrides,
  };
}

function acao(overrides: Partial<Acao> = {}): Acao {
  return {
    id: 'a1',
    clientId: 'c1',
    tipo: 'contato',
    segmento: 'engajado',
    status: 'concluido',
    createdAt: iso(5),
    updatedAt: iso(5),
    ...overrides,
  };
}

describe('buildFilaCadencia', () => {
  it('ignora clientes inativos', () => {
    const inativo = cliente({ id: 'c2', estado: 'Inativo' });
    const fila = buildFilaCadencia([inativo], [], [], CADENCIAS, NOW);
    expect(fila).toHaveLength(0);
  });

  it('ignora clientes sem Monitoria nem Price cadastrados', () => {
    const semServico = cliente({ servicos: [] });
    const fila = buildFilaCadencia([semServico], [], [], CADENCIAS, NOW);
    expect(fila).toHaveLength(0);
  });

  it('classifica "nunca atendido" quando não há reunião passada', () => {
    const c = cliente();
    const [item] = buildFilaCadencia([c], [], [], CADENCIAS, NOW);
    expect(item.relogios[0].status).toBe('nunca');
    expect(classificarCadencia(item)).toBe('vencido');
  });

  it('marca "coberto" quando existe reunião futura não cancelada do mesmo serviço', () => {
    const c = cliente();
    const ev = evento({ date: iso(-10) }); // futuro
    const [item] = buildFilaCadencia([c], [ev], [], CADENCIAS, NOW);
    expect(item.relogios[0].status).toBe('coberto');
    expect(item.precisaAcao).toBe(false);
  });

  it('reunião futura CANCELADA não cobre o relógio', () => {
    const c = cliente();
    const ev = evento({ date: iso(-10), status: 'Cancelado' });
    const [item] = buildFilaCadencia([c], [ev], [], CADENCIAS, NOW);
    expect(item.relogios[0].status).toBe('nunca');
  });

  it('reunião futura de OUTRO serviço não cobre o relógio (bug real corrigido)', () => {
    const c = cliente({ servicos: ['Monitoria', 'Price'] });
    const evPrice = evento({ date: iso(-10), servicos: ['Price'] });
    const [item] = buildFilaCadencia([c], [evPrice], [], CADENCIAS, NOW);
    const monitoria = item.relogios.find((r) => r.servico === 'Monitoria')!;
    const price = item.relogios.find((r) => r.servico === 'Price')!;
    expect(monitoria.status).toBe('nunca');
    expect(price.status).toBe('coberto');
  });

  it('serviço marcado como independente não gera relógio', () => {
    const c = cliente({ servicos: ['Monitoria', 'Price'], servicosIndependentes: ['Price'] });
    const [item] = buildFilaCadencia([c], [], [], CADENCIAS, NOW);
    expect(item.relogios).toHaveLength(1);
    expect(item.relogios[0].servico).toBe('Monitoria');
  });

  it('reunião dentro da cadência fica "em_dia"; fora da janela de vencimento fica "vencido"', () => {
    const c = cliente();
    const evRecente = evento({ date: iso(5) }); // 5 dias atrás, cadência 30 → em dia
    const [item] = buildFilaCadencia([c], [evRecente], [], CADENCIAS, NOW);
    expect(item.relogios[0].status).toBe('em_dia');

    const evAntiga = evento({ date: iso(40) }); // 40 dias atrás, cadência 30 → vencido
    const [item2] = buildFilaCadencia([c], [evAntiga], [], CADENCIAS, NOW);
    expect(item2.relogios[0].status).toBe('vencido');
  });

  it('ordena clientes vencidos antes de vencendo e de em_dia', () => {
    const vencido = cliente({ id: 'vencido' });
    const emDia = cliente({ id: 'em_dia' });
    const evEmDia = evento({ clientId: 'em_dia', date: iso(5) });
    const fila = buildFilaCadencia([emDia, vencido], [evEmDia], [], CADENCIAS, NOW);
    expect(fila.map((f) => f.cliente.id)).toEqual(['vencido', 'em_dia']);
  });

  it('dentro da mesma severidade, cliente com 2 serviços ruins vem antes de 1 serviço ruim', () => {
    const doisRuins = cliente({ id: 'dois-ruins', servicos: ['Monitoria', 'Price'] });
    const umRuim = cliente({ id: 'um-ruim', servicos: ['Monitoria', 'Price'] });
    // umRuim tem Price coberto (reunião futura) — só Monitoria fica ruim.
    const evPriceFuturo = evento({ clientId: 'um-ruim', date: iso(-10), servicos: ['Price'] });
    const fila = buildFilaCadencia([umRuim, doisRuins], [evPriceFuturo], [], CADENCIAS, NOW);
    expect(fila.map((f) => f.cliente.id)).toEqual(['dois-ruins', 'um-ruim']);
  });

  it('cliente com contato recente não refletido no relógio vai para o fim do próprio bloco de severidade', () => {
    const semContato = cliente({ id: 'sem-contato' });
    const comContato = cliente({ id: 'com-contato' });
    const acaoRecente = acao({ clientId: 'com-contato', status: 'concluido', dueAt: iso(1) });
    const fila = buildFilaCadencia([semContato, comContato], [], [acaoRecente], CADENCIAS, NOW);
    // Ambos "nunca atendido" (mesma severidade "vencido") — quem foi
    // contatado recentemente (mas o relógio de reunião não reflete isso)
    // deve ficar depois de quem não teve nenhum contato.
    expect(fila.map((f) => f.cliente.id)).toEqual(['sem-contato', 'com-contato']);
  });
});

describe('buildVencendoDashboard', () => {
  it('sempre inclui um relógio de Relatório, mesmo sem Monitoria/Price', () => {
    const c = cliente({ servicos: [] });
    const [item] = buildVencendoDashboard([c], [], CADENCIAS, NOW);
    expect(item.relogios.map((r) => r.servico)).toEqual(['Relatório']);
  });

  it('usa a cadência de relatório configurada no cliente, não o padrão global', () => {
    const c = cliente({ servicos: [], relatorioCadencia: { numero: 2, unidade: 'semana' } });
    const evRelatorio = evento({ type: 'Relatório', date: iso(10), servicos: [] });
    const [item] = buildVencendoDashboard([c], [evRelatorio], CADENCIAS, NOW);
    const relatorio = item.relogios.find((r) => r.servico === 'Relatório')!;
    // 2 semanas = 14 dias de cadência; último toque há 10 dias → dentro do prazo.
    expect(relatorio.cadencia).toBe(14);
    expect(relatorio.status).not.toBe('vencido');
  });

  it('ignora clientes inativos', () => {
    const inativo = cliente({ estado: 'Inativo' });
    expect(buildVencendoDashboard([inativo], [], CADENCIAS, NOW)).toHaveLength(0);
  });
});

describe('contatoRecenteNaoRefletido', () => {
  it('false quando não há último contato', () => {
    expect(contatoRecenteNaoRefletido(undefined, null)).toBe(false);
  });

  it('true quando o contato é mais recente que qualquer relógio', () => {
    const relogios: RelogioServico[] = [
      { servico: 'Monitoria', cadencia: 30, ultimo: new Date('2026-01-01'), proximo: null, atraso: 0, status: 'em_dia', statusReal: 'em_dia', atrasoReal: 0 },
    ];
    expect(contatoRecenteNaoRefletido(relogios, new Date('2026-02-01'))).toBe(true);
    expect(contatoRecenteNaoRefletido(relogios, new Date('2025-12-01'))).toBe(false);
  });
});

describe('classificarCadencia', () => {
  const mk = (status: RelogioServico['status'][]): FilaCadItem => ({
    cliente: cliente(),
    score: 0,
    precisaAcao: false,
    relogios: status.map((s) => ({ servico: 'Monitoria', cadencia: 30, ultimo: null, proximo: null, atraso: 0, status: s, statusReal: s === 'coberto' ? 'em_dia' : s, atrasoReal: 0 })),
  });

  it('"nunca" conta como vencido', () => {
    expect(classificarCadencia(mk(['nunca']))).toBe('vencido');
  });

  it('sem nenhum vencido/nunca, mas com vencendo, classifica como vencendo', () => {
    expect(classificarCadencia(mk(['coberto', 'vencendo']))).toBe('vencendo');
  });

  it('tudo em dia ou coberto classifica como em_dia', () => {
    expect(classificarCadencia(mk(['coberto', 'em_dia']))).toBe('em_dia');
  });
});

describe('rotuloRelogio', () => {
  const base: RelogioServico = { servico: 'Monitoria', cadencia: 30, ultimo: null, proximo: null, atraso: 0, status: 'em_dia', statusReal: 'em_dia', atrasoReal: 0 };

  it('nunca atendido', () => {
    expect(rotuloRelogio({ ...base, status: 'nunca' })).toBe('Monitoria: nunca atendido');
  });

  it('vencido mostra os dias de atraso', () => {
    expect(rotuloRelogio({ ...base, status: 'vencido', atraso: 12 })).toBe('Monitoria vencida há 12d');
  });

  it('vencendo mostra os dias restantes', () => {
    expect(rotuloRelogio({ ...base, status: 'vencendo', atraso: -3 })).toBe('Monitoria vence em 3d');
  });

  it('em dia', () => {
    expect(rotuloRelogio({ ...base, status: 'em_dia' })).toBe('Monitoria em dia');
  });
});

// Cenário do bug relatado: cliente com Monitoria EM DIA e Price VENCIDA
// aparecia em "Precisam de ação" ao filtrar por Monitoria, porque o filtro da
// página só checava se o cliente *possui* o serviço.
describe('buildFilaCadencia com serviço restrito', () => {
  const doisServicos = cliente({ servicos: ['Monitoria', 'Precificação'] });
  // Reunião de Monitoria recente (relógio de Monitoria em dia) e nenhum toque
  // de Price (relógio de Price "nunca atendido" = pede ação).
  const reuniaoMonitoriaRecente = evento({ date: iso(2), servicos: ['Monitoria'] });

  it('sem restrição, o cliente entra com os dois relógios e pede ação', () => {
    const [item] = buildFilaCadencia([doisServicos], [reuniaoMonitoriaRecente], [], CADENCIAS, NOW);
    expect(item.relogios.map((r) => r.servico)).toEqual(['Monitoria', 'Price']);
    expect(item.precisaAcao).toBe(true);
  });

  it('restrito a Monitoria, olha só o relógio de Monitoria e NÃO pede ação', () => {
    const [item] = buildFilaCadencia([doisServicos], [reuniaoMonitoriaRecente], [], CADENCIAS, NOW, { servico: 'Monitoria' });
    expect(item.relogios.map((r) => r.servico)).toEqual(['Monitoria']);
    expect(item.precisaAcao).toBe(false);
    expect(classificarCadencia(item)).toBe('em_dia');
  });

  it('restrito a Price, pede ação pelo relógio de Price', () => {
    const [item] = buildFilaCadencia([doisServicos], [reuniaoMonitoriaRecente], [], CADENCIAS, NOW, { servico: 'Price' });
    expect(item.relogios.map((r) => r.servico)).toEqual(['Price']);
    expect(item.precisaAcao).toBe(true);
    expect(classificarCadencia(item)).toBe('vencido');
  });

  it('cliente sem o serviço pedido sai da fila', () => {
    const soMonitoria = cliente({ servicos: ['Monitoria'] });
    const fila = buildFilaCadencia([soMonitoria], [], [], CADENCIAS, NOW, { servico: 'Price' });
    expect(fila).toHaveLength(0);
  });
});

// Cenário do bug relatado: cliente com Ação tipo 'price' registrada e marcada
// Concluída (ex.: "enviei uma precificação pra eles") continuava aparecendo
// "Price: nunca atendido" — a Ação só alimentava o "último contato" exibido,
// nunca o relógio de cadência em si (que só olhava Reunião/Relatório na Agenda).
describe('buildFilaCadencia — Ação de Price conta como toque', () => {
  const clientePrice = cliente({ servicos: ['Precificação'] });

  it('Ação price concluída zera o relógio de Price (deixa de pedir ação)', () => {
    const acaoPrice = acao({ tipo: 'price', status: 'concluido', dueAt: iso(1) });
    const [item] = buildFilaCadencia([clientePrice], [], [acaoPrice], CADENCIAS, NOW);
    expect(item.relogios[0].status).not.toBe('nunca');
    expect(item.relogios[0].ultimo).not.toBeNull();
    expect(classificarCadencia(item)).toBe('em_dia');
  });

  it('Ação price NÃO concluída (programada) não conta como toque', () => {
    const acaoPendente = acao({ tipo: 'price', status: 'programado', dueAt: iso(1) });
    const [item] = buildFilaCadencia([clientePrice], [], [acaoPendente], CADENCIAS, NOW);
    expect(item.relogios[0].status).toBe('nunca');
  });

  it('Ação de tipo diferente de price não conta como toque de Price', () => {
    const acaoContato = acao({ tipo: 'contato', status: 'concluido', dueAt: iso(1) });
    const [item] = buildFilaCadencia([clientePrice], [], [acaoContato], CADENCIAS, NOW);
    expect(item.relogios[0].status).toBe('nunca');
  });

  it('Ação price concluída NÃO zera o relógio de Monitoria de outro cliente com os dois serviços', () => {
    const doisServicos = cliente({ servicos: ['Monitoria', 'Precificação'] });
    const acaoPrice = acao({ tipo: 'price', status: 'concluido', dueAt: iso(1) });
    const [item] = buildFilaCadencia([doisServicos], [], [acaoPrice], CADENCIAS, NOW);
    const monitoria = item.relogios.find((r) => r.servico === 'Monitoria')!;
    const price = item.relogios.find((r) => r.servico === 'Price')!;
    expect(monitoria.status).toBe('nunca');
    expect(price.status).not.toBe('nunca');
  });
});

// Novo tipo de evento "Precificação" — precificação avulsa entregue fora de
// reunião, deve contar como toque de Price sem precisar da tag de serviço
// (que fica vazia no modo enxuto do formulário, como Relatório/Contato).
describe('buildFilaCadencia — evento tipo Precificação conta como toque de Price', () => {
  it('zera o relógio de Price mesmo sem tag de serviço', () => {
    const c = cliente({ servicos: ['Precificação'] });
    const precificacao = evento({ type: 'Precificação', servicos: [], date: iso(2) });
    const [item] = buildFilaCadencia([c], [precificacao], [], CADENCIAS, NOW);
    expect(item.relogios[0].status).not.toBe('nunca');
    expect(classificarCadencia(item)).toBe('em_dia');
  });

  it('não afeta o relógio de Monitoria', () => {
    const c = cliente({ servicos: ['Monitoria', 'Precificação'] });
    const precificacao = evento({ type: 'Precificação', servicos: [], date: iso(2) });
    const [item] = buildFilaCadencia([c], [precificacao], [], CADENCIAS, NOW);
    const monitoria = item.relogios.find((r) => r.servico === 'Monitoria')!;
    expect(monitoria.status).toBe('nunca');
  });
});

// Cenário do bug relatado (cliente GAP, caso real): relatório enviado e
// marcado Concluído continuava "Monitoria vencida" — só reunião contava como
// toque de Monitoria. Ação tipo 'relatorio' passou a contar também.
describe('buildFilaCadencia — Ação de Relatório conta como toque de Monitoria', () => {
  const clienteMonitoria = cliente({ servicos: ['Monitoria'] });

  it('Ação relatorio concluída zera o relógio de Monitoria (deixa de pedir ação)', () => {
    const acaoRelatorio = acao({ tipo: 'relatorio', status: 'concluido', dueAt: iso(1) });
    const [item] = buildFilaCadencia([clienteMonitoria], [], [acaoRelatorio], CADENCIAS, NOW);
    expect(item.relogios[0].status).not.toBe('nunca');
    expect(item.relogios[0].ultimo).not.toBeNull();
    expect(classificarCadencia(item)).toBe('em_dia');
  });

  it('Ação relatorio NÃO concluída (programada) não conta como toque', () => {
    const acaoPendente = acao({ tipo: 'relatorio', status: 'programado', dueAt: iso(1) });
    const [item] = buildFilaCadencia([clienteMonitoria], [], [acaoPendente], CADENCIAS, NOW);
    expect(item.relogios[0].status).toBe('nunca');
  });

  it('Ação de tipo diferente de relatorio não conta como toque de Monitoria', () => {
    const acaoContato = acao({ tipo: 'contato', status: 'concluido', dueAt: iso(1) });
    const [item] = buildFilaCadencia([clienteMonitoria], [], [acaoContato], CADENCIAS, NOW);
    expect(item.relogios[0].status).toBe('nunca');
  });

  it('Ação relatorio concluída NÃO zera o relógio de Price do mesmo cliente', () => {
    const doisServicos = cliente({ servicos: ['Monitoria', 'Precificação'] });
    const acaoRelatorio = acao({ tipo: 'relatorio', status: 'concluido', dueAt: iso(1) });
    const [item] = buildFilaCadencia([doisServicos], [], [acaoRelatorio], CADENCIAS, NOW);
    const monitoria = item.relogios.find((r) => r.servico === 'Monitoria')!;
    const price = item.relogios.find((r) => r.servico === 'Price')!;
    expect(monitoria.status).not.toBe('nunca');
    expect(price.status).toBe('nunca');
  });
});
