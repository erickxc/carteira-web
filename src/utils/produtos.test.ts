import { describe, expect, it } from 'vitest';
import {
  derivarCamposLegados,
  eh2DPrice,
  ehPlataforma2D,
  mudancasDeFase,
  produtosDeLegado,
  renomearProduto,
  traduzirPatchLegado,
  type ProdutoCliente,
} from 'carteira-shared/produtos.cjs';

const AGORA = '2026-10-30T12:00:00.000Z';
const p = (produto: string, fase: string, extra: Partial<ProdutoCliente> = {}): ProdutoCliente => ({
  produto,
  fase,
  faseDesde: '2026-01-01T00:00:00.000Z',
  motivoFase: 'cadastro',
  ...extra,
});

describe('reconhecimento e renomeação', () => {
  it('aceita nome antigo e novo', () => {
    expect(ehPlataforma2D('Monitoria') && ehPlataforma2D('Plataforma 2D')).toBe(true);
    expect(ehPlataforma2D('2D Price')).toBe(false);
    expect(['Precificação', 'Price', '2D Price'].every(eh2DPrice)).toBe(true);
  });

  it('renomeia só os dois produtos de cadência', () => {
    expect(renomearProduto('Precificação')).toBe('2D Price');
    expect(renomearProduto('Monitoria')).toBe('Plataforma 2D');
    expect(renomearProduto('Apura')).toBe('Apura');
  });
});

describe('derivarCamposLegados', () => {
  it('só Ativo entra em servicos; Suspenso/Em breve ficam fora', () => {
    const r = derivarCamposLegados([
      p('Plataforma 2D', 'Ativo', { independente: true, link: 'L' }),
      p('2D Price', 'Ativo', { login: 'X', senhaCifrada: 'S' }),
      p('Apura', 'Suspenso'),
      p('2D Nexus', 'Em breve'),
    ]);
    expect(r.servicos).toEqual(['Plataforma 2D', '2D Price']);
    expect(r.servicosIndependentes).toEqual(['Plataforma 2D']);
    expect(r.linksServicos).toEqual({ 'Plataforma 2D': 'L' });
    expect(r.loginPrice).toBe('X');
    expect(r.senhaPriceCifrada).toBe('S');
  });
});

describe('produtosDeLegado', () => {
  it('nome antigo e novo misturados contam uma vez', () => {
    const r = produtosDeLegado(
      { servicos: ['Monitoria', 'Plataforma 2D', '2D Nexus'], servicosIndependentes: ['Monitoria'] },
      { agora: AGORA, faseInicial: (x) => (/nexus|alcance/i.test(x) ? 'Em breve' : 'Ativo'), motivo: 'm' },
    );
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ produto: 'Plataforma 2D', fase: 'Ativo', independente: true, motivoFase: 'm' });
    expect(r[1]).toMatchObject({ produto: '2D Nexus', fase: 'Em breve' });
  });

  it('lê servicos gravado como texto e leva link/login do Price', () => {
    const r = produtosDeLegado(
      {
        servicos: '["Precificação"]',
        linksServicos: { Precificação: 'http://x' },
        loginPrice: '123',
        senhaPriceCifrada: 'S',
        createdAt: '2025-03-01T00:00:00.000Z',
      },
      { agora: AGORA, motivo: 'm' },
    );
    expect(r).toEqual([
      {
        produto: '2D Price',
        fase: 'Ativo',
        faseDesde: '2025-03-01T00:00:00.000Z',
        motivoFase: 'm',
        independente: false,
        link: 'http://x',
        login: '123',
        senhaCifrada: 'S',
      },
    ]);
  });
});

describe('traduzirPatchLegado', () => {
  const atuais = [p('Plataforma 2D', 'Ativo'), p('2D Price', 'Ativo'), p('Apura', 'Suspenso')];

  it('produto Ativo que some vira Cancelado; Suspenso não é tocado', () => {
    const r = traduzirPatchLegado(atuais, { servicos: ['Plataforma 2D', 'Controladoria'] }, AGORA)!;
    const por = Object.fromEntries(r.map((x) => [x.produto, x]));
    expect(por['Plataforma 2D']).toEqual(atuais[0]);
    expect(por['2D Price']).toMatchObject({
      fase: 'Cancelado',
      faseDesde: AGORA,
      motivoFase: 'alterado por versão anterior da Carteira',
    });
    expect(por.Controladoria).toMatchObject({ fase: 'Ativo', faseDesde: AGORA });
    expect(por.Apura).toEqual(atuais[2]);
  });

  it('null sem campo legado ou com produtos no patch', () => {
    expect(traduzirPatchLegado(atuais, { produtos: [], servicos: [] }, AGORA)).toBeNull();
    expect(traduzirPatchLegado(atuais, { observacao: 'x' }, AGORA)).toBeNull();
  });

  it('independência e login do Price vindos da versão antiga', () => {
    const r = traduzirPatchLegado(atuais, { servicosIndependentes: ['Monitoria'], loginPrice: 'Y' }, AGORA)!;
    expect(r[0].independente).toBe(true);
    expect(r[1].login).toBe('Y');
  });
});

describe('mudancasDeFase', () => {
  it('detecta a troca e se o motivo foi informado', () => {
    const antes = [p('Apura', 'Ativo')];
    expect(mudancasDeFase(antes, [p('Apura', 'Suspenso')])).toEqual([
      { produto: 'Apura', de: 'Ativo', para: 'Suspenso', motivoMudou: false },
    ]);
    expect(mudancasDeFase(antes, [p('Apura', 'Suspenso', { motivoFase: 'cliente pediu' })])[0].motivoMudou).toBe(true);
    expect(mudancasDeFase(antes, [p('Apura', 'Ativo')])).toEqual([]);
    expect(mudancasDeFase([], [p('Raptor', 'Em breve')])).toEqual([
      { produto: 'Raptor', de: null, para: 'Em breve', motivoMudou: true },
    ]);
  });
});
