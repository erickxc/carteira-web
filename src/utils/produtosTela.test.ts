import { describe, expect, it } from 'vitest';
import { clientesComProduto, opcoesProdutoEvento, passaFiltroProduto, servicosDaImportacao } from './produtosTela';
import { servicosSemResponsavel, type ContatoVisivel } from './contatos';
import { buildFilaCadencia, comPrecificacaoDoGrupo } from './cadenciaServico';
import type { Cadencias, Cliente, EventoAgenda } from '../types';

const cli = (...produtos: [string, string][]) =>
  ({ produtos: produtos.map(([produto, fase]) => ({ produto, fase, faseDesde: '', motivoFase: '' })) }) as unknown as Cliente;

const CATEGORIAS = ['Plataforma 2D', 'Controladoria', 'Apura', '2D Price'];

describe('opcoesProdutoEvento', () => {
  it('mostra só os Ativos do cliente, na ordem do cadastro', () => {
    const c = cli(['2D Price', 'Ativo'], ['Apura', 'Ativo'], ['Controladoria', 'Suspenso']);
    expect(opcoesProdutoEvento(CATEGORIAS, c, [], false)).toEqual(['Apura', '2D Price']);
  });
  it('"ver todos" mostra a categoria inteira', () => {
    expect(opcoesProdutoEvento(CATEGORIAS, cli(['Apura', 'Ativo']), [], true)).toEqual(CATEGORIAS);
  });
  it('sem cliente ou cliente sem Ativo mostra todos — senão não haveria o que marcar', () => {
    expect(opcoesProdutoEvento(CATEGORIAS, undefined, [], false)).toEqual(CATEGORIAS);
    expect(opcoesProdutoEvento(CATEGORIAS, cli(['Apura', 'Suspenso']), [], false)).toEqual(CATEGORIAS);
  });
  it('produto já marcado nunca some, mesmo não sendo Ativo ou fora do cadastro', () => {
    expect(opcoesProdutoEvento(CATEGORIAS, cli(['Apura', 'Ativo']), ['2D Price', 'AutoTech'], false))
      .toEqual(['Apura', '2D Price', 'AutoTech']);
  });
  it('categoria com nome antigo casa com produto novo (antes da migração)', () => {
    expect(opcoesProdutoEvento(['Monitoria', 'Precificação'], cli(['Plataforma 2D', 'Ativo']), [], false)).toEqual(['Monitoria']);
  });
  it('marcado com nome antigo aparece no lugar da categoria, sem chip duplicado', () => {
    expect(opcoesProdutoEvento(CATEGORIAS, cli(['Plataforma 2D', 'Ativo']), ['Monitoria'], false)).toEqual(['Monitoria']);
  });
});

describe('passaFiltroProduto', () => {
  const c = cli(['Plataforma 2D', 'Ativo'], ['Apura', 'Suspenso']);
  it('sem produto escolhido, a fase padrão não filtra (cliente sem produto continua na lista)', () => {
    expect(passaFiltroProduto(cli(), [], 'Ativo')).toBe(true);
    expect(passaFiltroProduto(cli(), [], 'Todas')).toBe(true);
  });
  it('sem produto escolhido, outra fase procura em qualquer produto', () => {
    expect(passaFiltroProduto(c, [], 'Suspenso')).toBe(true);
    expect(passaFiltroProduto(c, [], 'Cancelado')).toBe(false);
  });
  it('produto escolhido precisa estar na fase', () => {
    expect(passaFiltroProduto(c, ['Plataforma 2D'], 'Ativo')).toBe(true);
    expect(passaFiltroProduto(c, ['Apura'], 'Ativo')).toBe(false);
    expect(passaFiltroProduto(c, ['Apura'], 'Suspenso')).toBe(true);
    expect(passaFiltroProduto(c, ['Apura'], 'Todas')).toBe(true);
    expect(passaFiltroProduto(c, ['Raptor'], 'Todas')).toBe(false);
  });
  it('filtro salvo com o nome antigo vale pelo novo', () => {
    expect(passaFiltroProduto(c, ['Monitoria'], 'Ativo')).toBe(true);
  });
});

describe('servicosDaImportacao', () => {
  const novas = ['Plataforma 2D', '2D Price'];
  const antigas = ['Monitoria', 'Precificação'];
  it('aceita coluna com nome novo e antigo', () => {
    expect(servicosDaImportacao({ 'Plataforma 2D': 'Sim', '2D Price': 'x' }, novas)).toEqual(novas);
    expect(servicosDaImportacao({ Monitoria: 'Sim', Precificação: 'Sim' }, novas)).toEqual(novas);
    expect(servicosDaImportacao({ monitoria: 'Sim', Price: 'Sim' }, novas)).toEqual(novas);
    expect(servicosDaImportacao({ Precificacao: 'Sim' }, novas)).toEqual(['2D Price']);
  });
  it('grava o nome vigente da categoria — /bulk não normaliza, e antes da migração a categoria é a antiga', () => {
    expect(servicosDaImportacao({ 'Plataforma 2D': 'Sim', '2D Price': 'Sim' }, antigas)).toEqual(antigas);
  });
  it('coluna vazia ou negativa não marca', () => {
    expect(servicosDaImportacao({ 'Plataforma 2D': '', Monitoria: 'não' }, novas)).toEqual([]);
  });
});

describe('opcoesProdutoEvento — casos de borda', () => {
  it('Em breve e Cancelado também ficam fora; cliente legado sem `produtos` vê todos', () => {
    const c = cli(['Apura', 'Ativo'], ['2D Nexus', 'Em breve'], ['Raptor', 'Cancelado']);
    expect(opcoesProdutoEvento([...CATEGORIAS, '2D Nexus', 'Raptor'], c, [], false)).toEqual(['Apura']);
    expect(opcoesProdutoEvento(CATEGORIAS, {} as Cliente, [], false)).toEqual(CATEGORIAS);
  });
  it('"ver todos" não some com o marcado fora da categoria nem repete chip', () => {
    expect(opcoesProdutoEvento(CATEGORIAS, cli(['Apura', 'Ativo']), ['AutoTech', 'Apura'], true))
      .toEqual([...CATEGORIAS, 'AutoTech']);
  });
  it('evento antigo com os dois nomes do mesmo produto gera um chip só', () => {
    expect(opcoesProdutoEvento(CATEGORIAS, cli(['Plataforma 2D', 'Ativo']), ['Monitoria', 'Plataforma 2D'], false)).toEqual(['Monitoria']);
  });
  it('Precificação marcada ocupa o lugar do 2D Price, mesmo com o cliente sem ele Ativo', () => {
    expect(opcoesProdutoEvento(CATEGORIAS, cli(['Apura', 'Ativo'], ['2D Price', 'Suspenso']), ['Precificação'], false))
      .toEqual(['Apura', 'Precificação']);
  });
  it('sugestão com nome oficial aparece numa categoria ainda antiga, sem chip a mais', () => {
    expect(opcoesProdutoEvento(['Monitoria', 'Precificação'], cli(['Plataforma 2D', 'Ativo']), ['2D Price'], false))
      .toEqual(['Monitoria', '2D Price']);
  });
});

describe('opcoesProdutoEvento — categoria e cliente fora de sincronia', () => {
  it('categoria com os dois nomes do mesmo produto gera um chip só', () => {
    expect(opcoesProdutoEvento(['Monitoria', 'Plataforma 2D', 'Apura'], undefined, ['Monitoria'], false)).toEqual(['Monitoria', 'Apura']);
    expect(opcoesProdutoEvento(['Monitoria', 'Plataforma 2D', 'Apura'], undefined, [], false)).toEqual(['Monitoria', 'Apura']);
  });
  it('Ativo só em produto removido da categoria mostra todos — senão a reunião não pode ser salva', () => {
    expect(opcoesProdutoEvento(CATEGORIAS, cli(['AutoTech', 'Ativo']), [], false)).toEqual(CATEGORIAS);
  });
});

describe('clientesComProduto', () => {
  const clientes = [
    { ...cli(['2D Nexus', 'Em breve']), servicos: [] },
    { ...cli(['Apura', 'Suspenso'], ['Plataforma 2D', 'Ativo']), servicos: ['Plataforma 2D'] },
    { servicos: ['Monitoria', 'Plataforma 2D'] },
  ] as unknown as Cliente[];
  it('conta qualquer fase, uma vez por cliente, com nome antigo ou novo', () => {
    expect(clientesComProduto(clientes, '2D Nexus')).toBe(1);
    expect(clientesComProduto(clientes, 'Apura')).toBe(1);
    expect(clientesComProduto(clientes, 'Plataforma 2D')).toBe(2);
    expect(clientesComProduto(clientes, 'Monitoria')).toBe(2);
    expect(clientesComProduto(clientes, 'Raptor')).toBe(0);
  });
});

describe('passaFiltroProduto — casos de borda', () => {
  it('filtro salvo "Precificação" acha 2D Price, e produto gravado com nome antigo acha o filtro novo', () => {
    expect(passaFiltroProduto(cli(['2D Price', 'Ativo']), ['Precificação'], 'Ativo')).toBe(true);
    expect(passaFiltroProduto(cli(['Monitoria', 'Ativo']), ['Plataforma 2D'], 'Ativo')).toBe(true);
  });
  it('vários produtos: basta um deles estar NA fase — outro produto na fase não conta', () => {
    const c = cli(['Plataforma 2D', 'Suspenso'], ['Apura', 'Ativo']);
    expect(passaFiltroProduto(c, ['Plataforma 2D', 'Apura'], 'Ativo')).toBe(true);
    expect(passaFiltroProduto(c, ['Plataforma 2D'], 'Ativo')).toBe(false);
  });
  it('cliente sem `produtos` não quebra: só sai quando há produto ou fase específica pedida', () => {
    const semLista = {} as Cliente;
    expect(passaFiltroProduto(semLista, [], 'Ativo')).toBe(true);
    expect(passaFiltroProduto(semLista, [], 'Suspenso')).toBe(false);
    expect(passaFiltroProduto(semLista, ['Apura'], 'Todas')).toBe(false);
  });
});

describe('servicosDaImportacao — casos de borda', () => {
  const novas = ['Plataforma 2D', '2D Price'];
  it('coluna nova e antiga na mesma linha marcam uma vez só', () => {
    expect(servicosDaImportacao({ 'Plataforma 2D': 'Sim', Monitoria: 'Sim', '2D Price': 'x', Price: 1, Precificação: true }, novas)).toEqual(novas);
  });
  it('coluna antiga vazia não apaga a nova ao lado', () => {
    expect(servicosDaImportacao({ Monitoria: '', 'Plataforma 2D': 'Sim' }, novas)).toEqual(['Plataforma 2D']);
  });
  it('categoria sem o produto cai no nome oficial; outras categorias não são confundidas', () => {
    expect(servicosDaImportacao({ Monitoria: 'Sim', Price: 'Sim' }, ['Apura', 'Protocolo GPS', 'Controladoria'])).toEqual(novas);
  });
});

describe('reunião com produto sem relógio (1.7: formulário oferece qualquer Ativo)', () => {
  const CAD = { monitoria_dias: 30, price_dias: 15, recontato_dias: 5 } as Cadencias;
  const now = new Date('2026-10-30T12:00:00Z');
  const cliente = (id: string, grupo = '') =>
    ({ id, empresa: id, estado: 'Ativo', status: 'Regular', grupo, createdAt: '2026-01-01T00:00:00.000Z', servicos: ['Plataforma 2D', '2D Price', 'Apura'] }) as unknown as Cliente;
  const reuniao = (clientId: string, date: string, status: string, servicos: string[]) =>
    ({ id: `${clientId}-${date}`, clientId, date, status, type: 'Reunião', servicos }) as unknown as EventoAgenda;
  const relogios = (agenda: EventoAgenda[]) => buildFilaCadencia([cliente('a')], agenda, [], CAD, now)[0].relogios;

  it('concluída só com Apura não zera nenhum relógio', () => {
    const base = relogios([]);
    const depois = relogios([reuniao('a', '2026-10-29T00:00:00.000Z', 'Concluído', ['Apura'])]);
    expect(depois.map((r) => [r.servico, r.status, r.atraso])).toEqual(base.map((r) => [r.servico, r.status, r.atraso]));
    expect(depois.every((r) => r.ultimo === null)).toBe(true);
  });
  it('agendada só com Apura não cobre o prazo', () => {
    const depois = relogios([reuniao('a', '2026-11-05T00:00:00.000Z', 'Agendado', ['Apura'])]);
    expect(depois.some((r) => r.status === 'coberto' || r.proximo)).toBe(false);
  });
  it('com Apura e Plataforma 2D zera só o relógio da Plataforma', () => {
    const [plat, price] = relogios([reuniao('a', '2026-10-29T00:00:00.000Z', 'Concluído', ['Apura', 'Plataforma 2D'])]);
    expect(plat.status).toBe('em_dia');
    expect(price.ultimo).toBeNull();
  });
  it('não vira precificação do grupo: nenhuma cópia para a loja-irmã', () => {
    const agenda = [reuniao('a', '2026-10-29T00:00:00.000Z', 'Concluído', ['Apura'])];
    expect(comPrecificacaoDoGrupo(agenda, [cliente('a', 'Rede'), cliente('b', 'Rede')])).toHaveLength(1);
  });
});

describe('servicosSemResponsavel com nome antigo no contato', () => {
  const visivel = (servicos: string[]) => ({ nome: 'Ana', servicos }) as unknown as ContatoVisivel;
  it('contato "Monitoria" responde por "Plataforma 2D", sem falso aviso', () => {
    const c = { servicos: ['Plataforma 2D', '2D Price'] } as unknown as Cliente;
    expect(servicosSemResponsavel(c, [visivel(['Monitoria'])])).toEqual(['2D Price']);
  });
});
