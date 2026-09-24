import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { repoMemoria } = require('./repo.cjs');
const { sincronizar } = require('./statusHistorico.cjs');

const cliente = (extra = {}) => ({
  id: 'c1', empresa: 'A', status: 'Regular', estado: 'Ativo', createdAt: '2026-05-27T16:58:10.163Z', ...extra,
});

describe('dominio/statusHistorico.sincronizar', () => {
  it('grava linha-base com createdAt do cliente, e não repete se nada mudou', () => {
    const repo = repoMemoria({ Clientes: [cliente()], StatusHistorico: [] });
    expect(sincronizar(repo)).toBe(1);
    const [base] = repo.get('StatusHistorico');
    expect(base).toMatchObject({ clientId: 'c1', status: 'Regular', estado: 'Ativo', mudouEm: '2026-05-27T16:58:10.163Z' });

    expect(sincronizar(repo)).toBe(0);
    expect(repo.get('StatusHistorico')).toHaveLength(1);
  });

  it('grava nova linha só quando status/estado/pausadoAte muda, com o horário da mudança', () => {
    const repo = repoMemoria({ Clientes: [cliente()], StatusHistorico: [] });
    sincronizar(repo);
    repo.update('Clientes', 'c1', { status: 'Suspenso' });
    expect(sincronizar(repo, new Date('2026-09-10T12:00:00.000Z'))).toBe(1);

    const linhas = repo.get('StatusHistorico');
    expect(linhas).toHaveLength(2);
    expect(linhas[1]).toMatchObject({ status: 'Suspenso', mudouEm: '2026-09-10T12:00:00.000Z' });

    repo.update('Clientes', 'c1', { observacao: 'campo que não é de situação' });
    expect(sincronizar(repo)).toBe(0);
  });

  it('cliente legado sem createdAt vale desde sempre', () => {
    const repo = repoMemoria({ Clientes: [cliente({ createdAt: undefined })], StatusHistorico: [] });
    sincronizar(repo);
    expect(repo.get('StatusHistorico')[0].mudouEm).toBe('1970-01-01T00:00:00.000Z');
  });
});
