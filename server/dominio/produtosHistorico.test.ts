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
