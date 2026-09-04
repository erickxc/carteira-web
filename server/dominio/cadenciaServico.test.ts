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

  /**
   * BUG REAL encontrado ao unificar o motor: a cópia do backend excluía
   * reunião Cancelada/Reagendada da "última interação"
   * (`agenda.filter((a) => !/cancel|reagend/i.test(a.status))` antes de
   * contar), enquanto a cópia do frontend (`src/utils/ultimaInteracao.ts`)
   * contava de propósito — "cancelar ou reagendar sempre envolveu falar com
   * o cliente". As duas nunca tinham teste cruzado comparando o mesmo caso,
   * então a divergência nunca apareceu num CI. O motor único adota o
   * comportamento do frontend (documentado com a razão de negócio).
   */
  it('reunião Cancelada conta como última interação (agora igual ao frontend)', () => {
    const agenda = [{ clientId: 'c1', date: '2026-09-01T12:00:00.000Z', status: 'Cancelado' }];
    const mapa = cadencia.buildUltimaInteracaoMap(agenda, [], { now: AGORA });
    expect(mapa.get('c1')?.toISOString()).toBe('2026-09-01T12:00:00.000Z');
  });

  it('reunião Reagendada também conta', () => {
    const agenda = [{ clientId: 'c1', date: '2026-09-02T12:00:00.000Z', status: 'Reagendado' }];
    const mapa = cadencia.buildUltimaInteracaoMap(agenda, [], { now: AGORA });
    expect(mapa.get('c1')?.toISOString()).toBe('2026-09-02T12:00:00.000Z');
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

describe('buscarAlertasSemAcompanhamento — reflete o mesmo comportamento de Cancelado', () => {
  const AGORA = new Date('2026-09-04T12:00:00.000Z');

  it('reunião Cancelada recente tira o cliente do alerta de "sem acompanhamento"', () => {
    const clientes = [{ id: 'c1', empresa: 'Cliente X', estado: 'Ativo', status: 'Regular' }];
    // Cancelada há 3 dias — antes da unificação, isso era IGNORADO (contava
    // como se não houvesse contato nenhum) e o cliente apareceria aqui.
    const agenda = [{ clientId: 'c1', date: '2026-09-01T12:00:00.000Z', status: 'Cancelado' }];
    const alertas = cadencia.buscarAlertasSemAcompanhamento(clientes, agenda, [], AGORA);
    expect(alertas.find((a: { id: string }) => a.id === 'c1')).toBeUndefined();
  });
});
