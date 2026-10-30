import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { repoMemoria } = require('./repo.cjs');
const { sincronizar } = require('./produtosHistorico.cjs');

const cliente = (produtos: unknown, extra = {}) => ({
  id: 'c1', empresa: 'A', createdAt: '2026-05-27T16:58:10.163Z', produtos, ...extra,
});
const prod = (produto: string, fase: string, extra = {}) => ({ produto, fase, faseDesde: '', motivoFase: 'm0', ...extra });

describe('dominio/produtosHistorico.sincronizar', () => {
  it('grava linha-base por cliente+produto (faseDesde, senão createdAt) e não repete sem mudança', () => {
    const repo = repoMemoria({
      Clientes: [cliente([prod('Plataforma 2D', 'Ativo'), prod('2D Price', 'Ativo', { faseDesde: '2026-10-30T00:00:00.000Z' })])],
      ProdutosHistorico: [],
    });
    expect(sincronizar(repo)).toBe(2);
    const linhas = repo.get('ProdutosHistorico');
    expect(linhas).toEqual(expect.arrayContaining([
      expect.objectContaining({ clientId: 'c1', produto: 'Plataforma 2D', fase: 'Ativo', mudouEm: '2026-05-27T16:58:10.163Z' }),
      expect.objectContaining({ clientId: 'c1', produto: '2D Price', fase: 'Ativo', mudouEm: '2026-10-30T00:00:00.000Z' }),
    ]));

    expect(sincronizar(repo)).toBe(0);
    expect(repo.get('ProdutosHistorico')).toHaveLength(2);
  });

  it('grava nova linha com o motivo só quando a fase muda', () => {
    const repo = repoMemoria({ Clientes: [cliente([prod('2D Price', 'Ativo')])], ProdutosHistorico: [] });
    sincronizar(repo);
    repo.update('Clientes', 'c1', { produtos: [prod('2D Price', 'Ativo', { link: 'x' })] });
    expect(sincronizar(repo)).toBe(0);

    repo.update('Clientes', 'c1', { produtos: [prod('2D Price', 'Cancelado', { motivoFase: 'cliente saiu' })] });
    expect(sincronizar(repo, new Date('2026-10-20T12:00:00.000Z'))).toBe(1);
    const linhas = repo.get('ProdutosHistorico');
    expect(linhas[1]).toMatchObject({ produto: '2D Price', fase: 'Cancelado', motivo: 'cliente saiu', mudouEm: '2026-10-20T12:00:00.000Z' });
  });

  it('nome antigo no histórico conta como o mesmo produto', () => {
    const repo = repoMemoria({
      Clientes: [cliente([prod('2D Price', 'Ativo')])],
      ProdutosHistorico: [{ id: 'h', clientId: 'c1', produto: 'Precificação', fase: 'Ativo', motivo: '', mudouEm: '2026-01-01T00:00:00.000Z' }],
    });
    expect(sincronizar(repo)).toBe(0);
  });

  it('cliente sem produtos (não migrado) não ganha linha', () => {
    const repo = repoMemoria({ Clientes: [cliente(undefined, { servicos: ['Monitoria'] })], ProdutosHistorico: [] });
    expect(sincronizar(repo)).toBe(0);
  });
});

describe('dominio/produtosHistorico: gancho em clientes.criar/atualizar', () => {
  // `efeitosExternos` ligado, mas sem `relatorioCadencia`: nenhum efeito sai do repo em memória.
  const clientesDominio = require('./clientes.cjs');
  const D = '2026-05-27T16:58:10.163Z';
  const base = (produtos: unknown[]) => repoMemoria({
    Clientes: [{ id: 'c1', empresa: 'T', createdAt: D, produtos, servicos: [] }],
    ProdutosHistorico: [], StatusHistorico: [], Categorias: [],
  });

  it('criar com produtos grava a linha-base de cada produto', () => {
    const repo = repoMemoria({ Clientes: [], ProdutosHistorico: [], StatusHistorico: [], Categorias: [] });
    const novo = clientesDominio.criar(repo, { empresa: 'N', createdAt: D, produtos: [prod('Plataforma 2D', 'Ativo'), prod('Apura', 'Suspenso')] });
    const linhas = repo.get('ProdutosHistorico');
    expect(linhas).toHaveLength(2);
    expect(linhas.every((l: { clientId: string }) => l.clientId === novo.id)).toBe(true);
  });

  it('patch da 1.6 (só servicos) traduzido grava a linha Cancelado com o motivo da versão anterior', () => {
    const repo = base([prod('Plataforma 2D', 'Ativo'), prod('2D Price', 'Ativo')]);
    sincronizar(repo);
    clientesDominio.atualizar(repo, 'c1', { servicos: ['Plataforma 2D'] });
    const linhas = repo.get('ProdutosHistorico');
    expect(linhas).toHaveLength(3);
    expect(linhas[2]).toMatchObject({ produto: '2D Price', fase: 'Cancelado', motivo: 'alterado por versão anterior da Carteira' });
  });

  it('efeitosExternos: false não grava histórico', () => {
    const repo = base([prod('2D Price', 'Ativo')]);
    clientesDominio.atualizar(repo, 'c1', { produtos: [prod('2D Price', 'Suspenso', { motivoFase: 'pausa' })] }, { efeitosExternos: false });
    expect(repo.get('ProdutosHistorico')).toHaveLength(0);
  });

  it('patch sem produtos nem campo legado não grava histórico', () => {
    const repo = base([prod('2D Price', 'Ativo')]);
    clientesDominio.atualizar(repo, 'c1', { observacao: 'x' });
    expect(repo.get('ProdutosHistorico')).toHaveLength(0);
  });
});

describe('dominio/produtosHistorico: casos de borda', () => {
  it('produtos gravado como texto JSON é lido', () => {
    const repo = repoMemoria({ Clientes: [cliente(JSON.stringify([prod('2D Price', 'Ativo')]))], ProdutosHistorico: [] });
    expect(sincronizar(repo)).toBe(1);
  });

  it('volta à fase anterior (Ativo → Suspenso → Ativo) grava as duas mudanças', () => {
    const repo = repoMemoria({ Clientes: [cliente([prod('2D Price', 'Ativo')])], ProdutosHistorico: [] });
    sincronizar(repo, new Date('2026-06-01T00:00:00.000Z'));
    repo.update('Clientes', 'c1', { produtos: [prod('2D Price', 'Suspenso', { motivoFase: 'pausa' })] });
    sincronizar(repo, new Date('2026-07-01T00:00:00.000Z'));
    repo.update('Clientes', 'c1', { produtos: [prod('2D Price', 'Ativo', { motivoFase: 'voltou' })] });
    expect(sincronizar(repo, new Date('2026-08-01T00:00:00.000Z'))).toBe(1);
    expect(repo.get('ProdutosHistorico').map((l: { fase: string }) => l.fase)).toEqual(['Ativo', 'Suspenso', 'Ativo']);
  });

  it('cliente sem createdAt nem faseDesde: linha-base em 1970 (vale para todos os meses)', () => {
    const repo = repoMemoria({ Clientes: [cliente([prod('2D Price', 'Ativo')], { createdAt: undefined })], ProdutosHistorico: [] });
    sincronizar(repo);
    expect(repo.get('ProdutosHistorico')[0].mudouEm).toBe('1970-01-01T00:00:00.000Z');
  });
});
