import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const cadencia = require('./cadenciaServico.cjs');

/**
 * Cobertura direta do lado backend do motor de cadência compartilhado
 * (`shared/cadenciaServico.cjs`, requerido daqui via `server/dominio/cadenciaServico.cjs`).
 *
 * Antes da unificação (04/09/2026) este arquivo não existia: o backend tinha
 * 412 linhas de lógica de cadência (`isClienteAtivo`, `buildFilaCadencia`,
 * `buildUltimaInteracaoMap`...) SEM nenhum teste dedicado — a única cobertura
 * indireta vinha de `alertas.test.ts` (só `isClienteAtivo`, via alertas) e
 * `tools.test.ts` (só o contrato de campos de `buscar_fila_priorizacao`,
 * não a regra em si). O motor inteiro só era testado pelo lado do FRONTEND
 * (`src/utils/cadenciaServico.test.ts`) — cobertura cruzada, não dupla: uma
 * mudança que quebrasse só o comportamento visto pelo backend passava no CI.
 *
 * Este arquivo fecha esse buraco: mesmo sendo o MESMO motor (não há mais
 * cópia), roda os casos aqui garante que o caminho `require()` do backend
 * (CommonJS, sem build step) continua funcionando — e trava especificamente
 * o bug de divergência real encontrado ao unificar (ver `buildUltimaInteracaoMap`).
 */

describe('isClienteAtivo', () => {
  it('Regular com estado Ativo é ativo', () => {
    expect(cadencia.isClienteAtivo({ estado: 'Ativo', status: 'Regular' })).toBe(true);
  });

  it('Atendido pelo Marco com estado Ativo NÃO é ativo (bug real corrigido antes)', () => {
    expect(cadencia.isClienteAtivo({ estado: 'Ativo', status: 'Atendido pelo Marco' })).toBe(false);
  });

  it('Férias com estado Ativo NÃO é ativo (fica fora das métricas)', () => {
    expect(cadencia.isClienteAtivo({ estado: 'Ativo', status: 'Férias' })).toBe(false);
  });

  it('estado Inativo nunca é ativo, mesmo com status Regular', () => {
    expect(cadencia.isClienteAtivo({ estado: 'Inativo', status: 'Regular' })).toBe(false);
  });

  it('sem estado (dado legado), cai no fallback por prefixo do status', () => {
    expect(cadencia.isClienteAtivo({ status: 'Ativo' })).toBe(true);
    expect(cadencia.isClienteAtivo({ status: 'Gratuidade total' })).toBe(true);
    expect(cadencia.isClienteAtivo({ status: 'Suspenso' })).toBe(false);
  });

  /**
   * Item 5 do levantamento de gaps: antes, a única forma de tirar um
   * cliente da fila era mudar `status` manualmente, sem data de retorno —
   * fácil esquecer de reverter. `pausadoAte` é independente de status/estado
   * e volta sozinho quando o dia passa.
   */
  describe('pausadoAte — pausa temporária', () => {
    const AGORA = new Date('2026-09-10T15:00:00.000Z');

    it('cliente com pausadoAte HOJE ainda conta como pausado (inclui o dia inteiro)', () => {
      expect(cadencia.isClienteAtivo({ estado: 'Ativo', status: 'Regular', pausadoAte: '2026-09-10' }, AGORA)).toBe(false);
    });

    it('cliente com pausadoAte no FUTURO está pausado mesmo com status/estado normais', () => {
      expect(cadencia.isClienteAtivo({ estado: 'Ativo', status: 'Regular', pausadoAte: '2026-09-15' }, AGORA)).toBe(false);
    });

    it('cliente com pausadoAte no PASSADO volta a valer status/estado normalmente (retomada automática)', () => {
      expect(cadencia.isClienteAtivo({ estado: 'Ativo', status: 'Regular', pausadoAte: '2026-09-09' }, AGORA)).toBe(true);
    });

    it('pausadoAte inválido (string corrompida) não derruba a checagem — ignora e usa status/estado', () => {
      expect(cadencia.isClienteAtivo({ estado: 'Ativo', status: 'Regular', pausadoAte: 'lixo' }, AGORA)).toBe(true);
    });

    it('sem pausadoAte, comportamento idêntico a antes', () => {
      expect(cadencia.isClienteAtivo({ estado: 'Ativo', status: 'Regular' }, AGORA)).toBe(true);
    });
  });
});

describe('buildUltimaInteracaoMap', () => {
  const AGORA = new Date('2026-09-04T12:00:00.000Z');

  // Regra de 25/09/2026: "falamos com o cliente" = evento CONCLUÍDO (qualquer
  // tipo) ou ação concluída. Cancelado, reagendado e "Agendado" não contam.
  it('reunião Cancelada NÃO conta como última interação', () => {
    const agenda = [{ clientId: 'c1', date: '2026-09-01T12:00:00.000Z', status: 'Cancelado' }];
    expect(cadencia.buildUltimaInteracaoMap(agenda, [], { now: AGORA }).has('c1')).toBe(false);
  });

  it('reunião Reagendada e evento passado Agendado também não contam; concluído conta', () => {
    const agenda = [
      { clientId: 'c1', date: '2026-09-02T12:00:00.000Z', status: 'Reagendado' },
      { clientId: 'c2', date: '2026-09-02T12:00:00.000Z', status: 'Agendado' },
      { clientId: 'c3', date: '2026-09-02T12:00:00.000Z', status: 'Concluído', type: 'Contato' },
    ];
    const mapa = cadencia.buildUltimaInteracaoMap(agenda, [], { now: AGORA });
    expect(mapa.has('c1')).toBe(false);
    expect(mapa.has('c2')).toBe(false);
    expect(mapa.get('c3')?.toISOString()).toBe('2026-09-02T12:00:00.000Z');
  });

  it('ação concluída conta como interação, ação programada não', () => {
    const acoes = [
      { clientId: 'c1', status: 'concluido', updatedAt: '2026-09-03T00:00:00.000Z' },
      { clientId: 'c2', status: 'programado', updatedAt: '2026-09-03T00:00:00.000Z' },
    ];
    const mapa = cadencia.buildUltimaInteracaoMap([], acoes, { now: AGORA });
    expect(mapa.has('c1')).toBe(true);
    expect(mapa.has('c2')).toBe(false);
  });

  /**
   * Correção de comportamento real (04/09/2026): antes só existia
   * 'concluido'/'programado'/'dispensado' — uma tentativa de contato
   * malsucedida (ligou, não atendeu) só podia virar 'concluido' pra sair da
   * lista de pendências, e isso zerava o relógio de cadência como se o
   * cliente tivesse sido atendido de verdade. 'sem_sucesso' é status novo
   * que registra a tentativa SEM contar como toque — o cliente continua
   * vencido/precisando de contato de verdade.
   */
  it('ação "sem_sucesso" NÃO conta como interação — cliente continua vencido', () => {
    const acoes = [{ clientId: 'c1', status: 'sem_sucesso', updatedAt: '2026-09-03T00:00:00.000Z' }];
    const mapa = cadencia.buildUltimaInteracaoMap([], acoes, { now: AGORA });
    expect(mapa.has('c1')).toBe(false);
  });

  it('interação futura (depois de "now") não conta', () => {
    const agenda = [{ clientId: 'c1', date: '2026-09-10T12:00:00.000Z', status: 'Concluído' }];
    const mapa = cadencia.buildUltimaInteracaoMap(agenda, [], { now: AGORA });
    expect(mapa.has('c1')).toBe(false);
  });
});

describe('buildFilaCadencia — o mesmo motor do frontend, via require() do backend', () => {
  const AGORA = new Date('2026-09-04T12:00:00.000Z');

  it('cliente ativo com Monitoria vencida entra na fila como vencido', () => {
    const clientes = [{ id: 'c1', empresa: 'Cliente X', estado: 'Ativo', status: 'Regular', servicos: ['Monitoria'], createdAt: '2026-01-01T00:00:00.000Z' }];
    const fila = cadencia.buildFilaCadencia(clientes, [], [], { monitoria_dias: 30 }, AGORA);
    expect(fila).toHaveLength(1);
    expect(cadencia.classificarCadencia(fila[0])).toBe('vencido');
  });

  it('cliente inativo nunca entra na fila', () => {
    const clientes = [{ id: 'c1', empresa: 'Cliente X', estado: 'Inativo', servicos: ['Monitoria'] }];
    expect(cadencia.buildFilaCadencia(clientes, [], [], {}, AGORA)).toHaveLength(0);
  });

  it('reunião marcada para HOJE (data à meia-noite) ainda conta como marcada depois que o dia começa', () => {
    const clientes = [{ id: 'c1', empresa: 'Peça', estado: 'Ativo', status: 'Regular', servicos: ['Precificação'], createdAt: '2026-01-01T00:00:00.000Z' }];
    const agora = new Date(2026, 8, 28, 10, 0);
    const agenda = [
      { clientId: 'c1', date: new Date(2026, 8, 10).toISOString(), type: 'Reunião', status: 'Concluído', servicos: ['Precificação'] },
      { clientId: 'c1', date: new Date(2026, 8, 28).toISOString(), time: '14:00', type: 'Reunião', status: 'Agendado', servicos: ['Precificação'] },
    ];
    const r = cadencia.buildFilaCadencia(clientes, agenda, [], { price_dias: 15 }, agora)[0].relogios[0];
    expect(r.statusReal).toBe('vencido');
    expect(r.status).toBe('coberto');
    // Concluída hoje é histórico ("último"), não "próximo".
    const concluida = agenda.map((e) => ({ ...e, status: 'Concluído' }));
    expect(cadencia.buildFilaCadencia(clientes, concluida, [], { price_dias: 15 }, agora)[0].relogios[0].proximo).toBeNull();
  });

  it('reunião de Monitoria recente zera o relógio (em dia)', () => {
    const clientes = [{ id: 'c1', empresa: 'Cliente X', estado: 'Ativo', status: 'Regular', servicos: ['Monitoria'] }];
    const agenda = [{ clientId: 'c1', date: '2026-09-01T12:00:00.000Z', type: 'Reunião', status: 'Concluído', servicos: ['Monitoria'] }];
    const fila = cadencia.buildFilaCadencia(clientes, agenda, [], { monitoria_dias: 30 }, AGORA);
    expect(cadencia.classificarCadencia(fila[0])).toBe('em_dia');
  });

  it('Ação de Price "sem_sucesso" NÃO cobre o relógio — cliente continua vencido (correção de comportamento)', () => {
    const clientes = [{ id: 'c1', empresa: 'Cliente X', estado: 'Ativo', status: 'Regular', servicos: ['Price'], createdAt: '2026-01-01T00:00:00.000Z' }];
    const acoes = [{ clientId: 'c1', tipo: 'price', status: 'sem_sucesso', updatedAt: '2026-09-03T00:00:00.000Z' }];
    const fila = cadencia.buildFilaCadencia(clientes, [], acoes, { price_dias: 30 }, AGORA);
    expect(cadencia.classificarCadencia(fila[0])).toBe('vencido');
  });

  /**
   * `opts.riscoPorCliente` — desempate por urgência do dossiê do monitorIA
   * (pedido do usuário: a fila deve "além das recomendações padrão,
   * considerar a urgência dos dossiês"). Deliberadamente DESEMPATE, não
   * override: nunca muda o BLOCO de severidade (vencido/vencendo/em_dia),
   * só a ordem dentro do mesmo bloco.
   */
  describe('opts.riscoPorCliente — desempate por urgência do dossiê', () => {
    it('dentro do mesmo bloco (vencido), risco alto vem antes de risco médio, mesmo com MENOS dias de atraso', () => {
      const clientes = [
        { id: 'c-medio', empresa: 'Cliente Médio', estado: 'Ativo', status: 'Regular', servicos: ['Monitoria'], createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'c-alto', empresa: 'Cliente Alto', estado: 'Ativo', status: 'Regular', servicos: ['Monitoria'], createdAt: '2026-08-01T00:00:00.000Z' },
      ];
      // c-medio: nunca atendido desde 01/01 (~8 meses de atraso).
      // c-alto: nunca atendido desde 01/08 (~1 mês de atraso) — atraso BEM menor.
      const risco = new Map([['c-medio', 'medio'], ['c-alto', 'alto']]);
      const fila = cadencia.buildFilaCadencia(clientes, [], [], { monitoria_dias: 30 }, AGORA, { riscoPorCliente: risco });
      expect(fila.map((f: { cliente: { id: string } }) => f.cliente.id)).toEqual(['c-alto', 'c-medio']);
    });

    it('risco NUNCA faz um cliente em_dia furar a frente de um vencido', () => {
      const clientes = [
        { id: 'c-em-dia', empresa: 'Em Dia', estado: 'Ativo', status: 'Regular', servicos: ['Monitoria'] },
        { id: 'c-vencido', empresa: 'Vencido', estado: 'Ativo', status: 'Regular', servicos: ['Monitoria'] },
      ];
      const agenda = [{ clientId: 'c-em-dia', date: '2026-09-01T12:00:00.000Z', type: 'Reunião', status: 'Concluído', servicos: ['Monitoria'] }];
      // c-em-dia tem risco ALTO, c-vencido nem tem dossiê — mesmo assim o
      // vencido continua primeiro, porque severidade de cadência manda.
      const risco = new Map([['c-em-dia', 'alto']]);
      const fila = cadencia.buildFilaCadencia(clientes, agenda, [], { monitoria_dias: 30 }, AGORA, { riscoPorCliente: risco });
      expect(fila.map((f: { cliente: { id: string } }) => f.cliente.id)).toEqual(['c-vencido', 'c-em-dia']);
    });

    it('sem opts.riscoPorCliente, comportamento idêntico a antes (nivelRisco fica undefined)', () => {
      const clientes = [{ id: 'c1', empresa: 'Cliente X', estado: 'Ativo', status: 'Regular', servicos: ['Monitoria'] }];
      const fila = cadencia.buildFilaCadencia(clientes, [], [], { monitoria_dias: 30 }, AGORA);
      expect(fila[0].nivelRisco).toBeUndefined();
    });
  });
});

describe('buscarAlertasSemAcompanhamento — só evento concluído conta como contato', () => {
  const AGORA = new Date('2026-09-04T12:00:00.000Z');

  it('reunião Cancelada recente NÃO tira o cliente do alerta', () => {
    const clientes = [{ id: 'c1', empresa: 'Cliente X', estado: 'Ativo', status: 'Regular', createdAt: '2026-01-01T00:00:00.000Z' }];
    const agenda = [{ clientId: 'c1', date: '2026-09-01T12:00:00.000Z', status: 'Cancelado' }];
    const alertas = cadencia.buscarAlertasSemAcompanhamento(clientes, agenda, [], AGORA);
    expect(alertas.find((a: { id: string }) => a.id === 'c1')).toBeDefined();
  });

  it('contato concluído recente tira o cliente do alerta', () => {
    const clientes = [{ id: 'c1', empresa: 'Cliente X', estado: 'Ativo', status: 'Regular', createdAt: '2026-01-01T00:00:00.000Z' }];
    const agenda = [{ clientId: 'c1', date: '2026-09-01T12:00:00.000Z', status: 'Concluído', type: 'Contato' }];
    const alertas = cadencia.buscarAlertasSemAcompanhamento(clientes, agenda, [], AGORA);
    expect(alertas.find((a: { id: string }) => a.id === 'c1')).toBeUndefined();
  });
});

describe('buscarCobertura', () => {
  const now = new Date(2026, 8, 24, 12);
  const cliente = (id: string, extra = {}) => ({ id, empresa: id, estado: 'Ativo', status: 'Regular', servicos: ['Monitoria'], ...extra });
  const ev = (clientId: string, type: string, status: string) => ({ clientId, type, status, date: '2026-09-10T03:00:00.000Z' });

  it('só conta reunião/relatório/precificação concluída ou realizada; agendada não', () => {
    const r = cadencia.buscarCobertura(
      [cliente('agendado'), cliente('concluido'), cliente('precificacao'), cliente('realizado')],
      [ev('agendado', 'Reunião', 'Agendado'), ev('concluido', 'Reunião', 'Concluído'), ev('precificacao', 'Precificação', 'Concluído'), ev('realizado', 'Relatório', 'Realizado')],
      now,
    );
    expect(r).toMatchObject({ total: 4, cobertos: 3, semContato: 1, semContatoClientes: ['agendado'] });
  });

  it('cliente com todos os serviços independentes fica fora do denominador', () => {
    const r = cadencia.buscarCobertura([cliente('indep', { servicosIndependentes: ['Monitoria'] }), cliente('normal')], [], now);
    expect(r.total).toBe(1);
  });
});

describe('regras de prazo (spec 2026-09-25)', () => {
  const motor = require('../../shared/cadenciaServico.cjs');
  const AGORA = new Date('2026-09-25T18:00:00.000Z');
  const diasAtras = (n: number) => new Date(AGORA.getTime() - n * 864e5).toISOString();
  const cli = (over = {}) => ({ id: 'c1', empresa: 'Loja', estado: 'Ativo', status: 'Regular', servicos: ['Monitoria'], createdAt: '2026-01-01T00:00:00.000Z', ...over });
  const relogio = (agenda: object[], over = {}, acoes: object[] = []) =>
    motor.buildFilaCadencia([cli(over)], agenda, acoes, { monitoria_dias: 30 }, AGORA)[0].relogios[0];

  it('só entrega CONCLUÍDA zera o prazo; passado ainda Agendado não', () => {
    expect(relogio([{ clientId: 'c1', type: 'Reunião', status: 'Agendado', date: diasAtras(3), servicos: ['Monitoria'] }]).statusReal).toBe('nunca');
    expect(relogio([{ clientId: 'c1', type: 'Reunião', status: 'Concluído', date: diasAtras(3), servicos: ['Monitoria'] }]).statusReal).toBe('em_dia');
  });

  it('reunião sem serviço não zera a Monitoria; relatório com Monitoria zera', () => {
    expect(relogio([{ clientId: 'c1', type: 'Reunião', status: 'Concluído', date: diasAtras(3), servicos: [] }]).statusReal).toBe('nunca');
    expect(relogio([{ clientId: 'c1', type: 'Relatório', status: 'Concluído', date: diasAtras(3), servicos: ['Monitoria'] }]).statusReal).toBe('em_dia');
  });

  it('contato concluído com serviço marcado não zera prazo', () => {
    expect(relogio([{ clientId: 'c1', type: 'Contato', status: 'Concluído', date: diasAtras(3), servicos: ['Monitoria'] }]).statusReal).toBe('nunca');
  });

  it('reunião reagendada conta na data nova quando concluída', () => {
    const r = relogio([{ clientId: 'c1', type: 'Reunião', status: 'Concluído', date: diasAtras(2), servicos: ['Monitoria'], reagendamentos: 1, datasAnteriores: [diasAtras(40)] }]);
    expect(r.ultimo?.toISOString()).toBe(diasAtras(2));
    expect(r.statusReal).toBe('em_dia');
  });

  it('atendimento novo tem carência de um prazo a partir do cadastro', () => {
    expect(relogio([], { createdAt: diasAtras(10) }).statusReal).toBe('em_dia');
    expect(relogio([], { createdAt: diasAtras(27) }).statusReal).toBe('vencendo');
    expect(relogio([], { createdAt: diasAtras(31) }).statusReal).toBe('nunca');
    expect(relogio([], { createdAt: undefined }).statusReal).toBe('nunca'); // legado sem data: sem carência
  });

  it('Price padrão é 15 dias quando a cadência não está configurada', () => {
    const [f] = motor.buildFilaCadencia([cli({ servicos: ['Precificação'] })], [], [], {}, AGORA);
    expect(f.relogios[0].cadencia).toBe(15);
  });

  it('atendimento em dia só com TODOS os relógios no prazo (vencendo conta como no prazo)', () => {
    const noPrazo = { statusReal: 'em_dia' }, vencendo = { statusReal: 'vencendo' }, vencido = { statusReal: 'vencido' };
    expect(motor.atendimentoEmDia({ relogios: [noPrazo, vencendo] })).toBe(true);
    expect(motor.atendimentoEmDia({ relogios: [noPrazo, vencido] })).toBe(false);
    expect(motor.atendimentoEmDia({ relogios: [] })).toBe(false);
  });

  it('itensVencendo: a menos de N dias do prazo e sem reunião futura marcada', () => {
    const fila = motor.buildFilaCadencia(
      [cli({ id: 'a', empresa: 'A' }), cli({ id: 'b', empresa: 'B' })],
      [
        { clientId: 'a', type: 'Reunião', status: 'Concluído', date: diasAtras(27), servicos: ['Monitoria'] },
        { clientId: 'b', type: 'Reunião', status: 'Concluído', date: diasAtras(27), servicos: ['Monitoria'] },
        { clientId: 'b', type: 'Reunião', status: 'Agendado', date: new Date(AGORA.getTime() + 2 * 864e5).toISOString(), servicos: ['Monitoria'] },
      ],
      [], { monitoria_dias: 30 }, AGORA,
    );
    const itens = motor.itensVencendo(fila, 5);
    expect(itens.map((i: { cliente: { id: string } }) => i.cliente.id)).toEqual(['a']);
    expect(itens[0].diasParaVencer).toBe(3);
  });

  it('Cobertura por Serviço: base só com relógio (independente fora) e vencendo conta como no prazo', () => {
    const clientes = [
      cli({ id: 'indep', empresa: 'Indep', servicos: ['Precificação'], servicosIndependentes: ['Precificação'] }),
      cli({ id: 'venc', empresa: 'Venc', servicos: ['Precificação'] }),
    ];
    const agenda = [{ clientId: 'venc', type: 'Precificação', status: 'Concluído', date: diasAtras(12), servicos: ['Precificação'] }];
    const price = cadencia.buscarCoberturaServicos(clientes, agenda, [], { price_dias: 15 }, AGORA).find((s: { servico: string }) => s.servico === '2D Price');
    expect(price).toMatchObject({ contrataram: 1, atendidos: 1 });
  });
});

describe('categoriaCancelamento', () => {
  const shared = require('../../shared/cadenciaServico.cjs');
  const cat = (motivo?: string, motivoCategoria?: string, status = 'Cancelado') => shared.categoriaCancelamento({ status, motivo, motivoCategoria });

  it('não cancelado → null; categoria gravada vence o texto', () => {
    expect(cat('errata', undefined, 'Concluído')).toBeNull();
    expect(cat('errata', 'cliente_cancelou')).toBe('cliente_cancelou');
  });

  it('legado: deduz pelo texto dos motivos reais da base', () => {
    expect(['errata', 'duplicada', 'Duplicado', 'Reunião não marcada'].map((m) => cat(m))).toEqual(Array(4).fill('lancamento_errado'));
    expect(['Cliente não apareceu', 'Não obtivemos retorno.', 'Cliente não responde.'].map((m) => cat(m))).toEqual(Array(3).fill('cliente_ausente'));
    expect(['Cliente quis remarcar a reunião.', 'Cliente teve um problema e solicitou o cancelamento', 'Sistema do cliente caiu e precisou sair da reunião'].map((m) => cat(m))).toEqual(Array(3).fill('cliente_cancelou'));
    expect(['Foi feito um relatório para o cliente.', 'Cliente fez precificação recente.', 'domingo'].map((m) => cat(m))).toEqual(Array(3).fill('nos_cancelamos'));
    expect([undefined, 'cancelado'].map((m) => cat(m))).toEqual(['sem_categoria', 'sem_categoria']);
  });
});

/**
 * 1.7.0 (produtos do cliente): "Monitoria" virou Plataforma 2D e "Precificação"
 * virou 2D Price. O motor reconhece os dois nomes (evento antigo continua
 * zerando o relógio) e o relógio "nunca atendido" parte de quando o produto
 * entrou (`faseDesde`), não só do cadastro do cliente.
 */
describe('buildFilaCadencia — Plataforma 2D / 2D Price e faseDesde', () => {
  const AGORA = new Date('2026-10-31T12:00:00');
  const base = { id: 'c1', empresa: 'Loja', estado: 'Ativo', status: 'Regular', createdAt: '2026-05-25T00:00:00' };
  const relogio = (fila: { relogios: { servico: string }[] }[], servico: string) => fila[0]?.relogios.find((r) => r.servico === servico);

  it('relógios com os nomes novos; reunião com Plataforma 2D zera só a Plataforma 2D', () => {
    const c = { ...base, servicos: ['Plataforma 2D', '2D Price'] };
    const reuniao = { clientId: 'c1', date: '2026-10-26', type: 'Reunião', status: 'Concluído', servicos: ['Plataforma 2D'] };
    const fila = cadencia.buildFilaCadencia([c], [reuniao], [], {}, AGORA);
    expect(relogio(fila, 'Plataforma 2D')?.status).toBe('em_dia');
    expect(relogio(fila, '2D Price')?.status).toBe('nunca');
  });

  it('evento antigo marcado "Monitoria" zera o relógio da Plataforma 2D', () => {
    const c = { ...base, servicos: ['Plataforma 2D'] };
    const reuniao = { clientId: 'c1', date: '2026-10-26', type: 'Reunião', status: 'Concluído', servicos: ['Monitoria'] };
    const fila = cadencia.buildFilaCadencia([c], [reuniao], [], {}, AGORA);
    expect(relogio(fila, 'Plataforma 2D')?.status).toBe('em_dia');
  });

  it('nome antigo e novo juntos no cliente geram um relógio só', () => {
    const fila = cadencia.buildFilaCadencia([{ ...base, servicos: ['Monitoria', 'Plataforma 2D'] }], [], [], {}, AGORA);
    expect(fila[0].relogios.map((r: { servico: string }) => r.servico)).toEqual(['Plataforma 2D']);
  });

  it('opts.servico aceita o nome antigo (filtro salvo no navegador, monitorIA)', () => {
    const c = { ...base, servicos: ['Plataforma 2D', '2D Price'] };
    const fila = cadencia.buildFilaCadencia([c], [], [], {}, AGORA, { servico: 'Price' });
    expect(fila[0].relogios.map((r: { servico: string }) => r.servico)).toEqual(['2D Price']);
  });

  it('produto que entrou depois do cadastro conta o prazo a partir de faseDesde', () => {
    const c = { ...base, servicos: ['2D Price'], produtos: [{ produto: '2D Price', fase: 'Ativo', faseDesde: '2026-10-30T00:00:00' }] };
    const r = relogio(cadencia.buildFilaCadencia([c], [], [], { price_dias: 15 }, AGORA), '2D Price');
    expect(r?.status).not.toBe('nunca');
    expect(r?.atrasoReal).toBe(1 - 15);
  });

  it('produtos gravado como texto JSON (dupla serialização) também é lido', () => {
    const c = { ...base, servicos: ['2D Price'], produtos: JSON.stringify([{ produto: '2D Price', fase: 'Ativo', faseDesde: '2026-10-30T00:00:00' }]) };
    expect(relogio(cadencia.buildFilaCadencia([c], [], [], { price_dias: 15 }, AGORA), '2D Price')?.atrasoReal).toBe(1 - 15);
  });

  it('sem faseDesde (legado) o prazo continua contando do cadastro', () => {
    const c = { ...base, servicos: ['2D Price'], produtos: [{ produto: '2D Price', fase: 'Ativo' }] };
    const r = relogio(cadencia.buildFilaCadencia([c], [], [], { price_dias: 15 }, AGORA), '2D Price');
    expect(r?.status).toBe('nunca');
    expect(r?.atrasoReal).toBe(159 - 15);
  });

  it('faseDesde anterior ao cadastro não antecipa o prazo', () => {
    const c = { ...base, servicos: ['2D Price'], produtos: [{ produto: '2D Price', fase: 'Ativo', faseDesde: '2025-01-01T00:00:00' }] };
    expect(relogio(cadencia.buildFilaCadencia([c], [], [], { price_dias: 15 }, AGORA), '2D Price')?.atrasoReal).toBe(159 - 15);
  });
});

describe('Task 2 — casos de borda (nomes misturados e faseDesde)', () => {
  const AGORA = new Date('2026-10-31T12:00:00');
  const base = { id: 'c1', empresa: 'Loja', estado: 'Ativo', status: 'Regular', createdAt: '2026-05-25T00:00:00' };
  type Fila = { relogios: { servico: string; status: string; atrasoReal: number }[] }[];
  const relogio = (fila: Fila, servico: string) => fila[0]?.relogios.find((r) => r.servico === servico);
  const fila = (c: object, agenda: object[] = []) => cadencia.buildFilaCadencia([c], agenda, [], { price_dias: 15 }, AGORA) as Fila;

  it('independente com nome antigo vale para o produto com nome novo (sem relógio)', () => {
    const c = { ...base, servicos: ['Plataforma 2D', '2D Price'], servicosIndependentes: ['Monitoria'] };
    expect(fila(c)[0].relogios.map((r) => r.servico)).toEqual(['2D Price']);
  });

  it('nome antigo e novo do Price juntos geram um relógio só', () => {
    const c = { ...base, servicos: ['Precificação', '2D Price'] };
    expect(fila(c)[0].relogios.map((r) => r.servico)).toEqual(['2D Price']);
  });

  it('reunião antiga marcada "Precificação" zera o 2D Price', () => {
    const c = { ...base, servicos: ['2D Price'] };
    const ev = { clientId: 'c1', date: '2026-10-26', type: 'Reunião', status: 'Concluído', servicos: ['Precificação'] };
    expect(relogio(fila(c, [ev]), '2D Price')?.status).toBe('em_dia');
  });

  it('produto Suspenso não empresta faseDesde: conta do cadastro', () => {
    const c = { ...base, servicos: ['2D Price'], produtos: [{ produto: '2D Price', fase: 'Suspenso', faseDesde: '2026-10-30T00:00:00' }] };
    expect(relogio(fila(c), '2D Price')?.atrasoReal).toBe(159 - 15);
  });

  it('faseDesde inválido cai no cadastro', () => {
    const c = { ...base, servicos: ['2D Price'], produtos: [{ produto: '2D Price', fase: 'Ativo', faseDesde: 'lixo' }] };
    expect(relogio(fila(c), '2D Price')?.atrasoReal).toBe(159 - 15);
  });

  it('faseDesde de outro produto não muda o relógio da Plataforma 2D', () => {
    const c = { ...base, servicos: ['Plataforma 2D', '2D Price'], produtos: [{ produto: '2D Price', fase: 'Ativo', faseDesde: '2026-10-30T00:00:00' }] };
    expect(relogio(fila(c), 'Plataforma 2D')?.atrasoReal).toBe(159 - 30);
    expect(relogio(fila(c), '2D Price')?.atrasoReal).toBe(1 - 15);
  });

  it('produto com nome antigo em produtos também é reconhecido', () => {
    const c = { ...base, servicos: ['Precificação'], produtos: [{ produto: 'Precificação', fase: 'Ativo', faseDesde: '2026-10-30T00:00:00' }] };
    expect(relogio(fila(c), '2D Price')?.atrasoReal).toBe(1 - 15);
  });

  it('com toque concluído, faseDesde não altera o relógio (regra só do "nunca atendido")', () => {
    const c = { ...base, servicos: ['2D Price'], produtos: [{ produto: '2D Price', fase: 'Ativo', faseDesde: '2026-10-30T00:00:00' }] };
    const ev = { clientId: 'c1', date: '2026-09-01', type: 'Precificação', status: 'Concluído', servicos: [] };
    const r = relogio(fila(c, [ev]), '2D Price');
    expect(r?.status).toBe('vencido');
    expect(r?.atrasoReal).toBe(60 - 15);
  });

  it('sem createdAt mas com faseDesde: conta da fase em vez de "nunca" imediato', () => {
    const semCadastro: Record<string, unknown> = { ...base };
    delete semCadastro.createdAt;
    const c = { ...semCadastro, servicos: ['2D Price'], produtos: [{ produto: '2D Price', fase: 'Ativo', faseDesde: '2026-10-30T00:00:00' }] };
    expect(relogio(fila(c), '2D Price')?.status).toBe('em_dia');
  });

  it('servicoDoRelogio converte nomes antigos e preserva os demais', () => {
    expect(['Monitoria', 'Precificação', 'Price', 'Plataforma 2D', '2D Price', 'Apura'].map(require('../../shared/cadenciaServico.cjs').servicoDoRelogio))
      .toEqual(['Plataforma 2D', '2D Price', '2D Price', 'Plataforma 2D', '2D Price', 'Apura']);
  });

  it('calcularAderencia com opts.servico antigo = mesmo resultado do nome novo', () => {
    const clientes = [{ ...base, servicos: ['Plataforma 2D', '2D Price'] }];
    const agenda = [{ clientId: 'c1', date: '2026-10-26', type: 'Reunião', status: 'Concluído', servicos: ['Plataforma 2D'] }];
    const novo = cadencia.calcularAderencia(clientes, agenda, [], {}, AGORA, { servico: 'Plataforma 2D' });
    expect(cadencia.calcularAderencia(clientes, agenda, [], {}, AGORA, { servico: 'Monitoria' })).toEqual(novo);
    expect(novo).toMatchObject({ total: 1, emDia: 1 });
    expect(cadencia.calcularAderencia(clientes, agenda, [], {}, AGORA, { servico: 'Price' })).toMatchObject({ total: 1, emDia: 0 });
  });
});
