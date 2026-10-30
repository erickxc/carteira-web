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

describe('casos de borda (testador)', () => {
  const cadastro = [
    p('Plataforma 2D', 'Ativo', { independente: true, link: 'LP' }),
    p('2D Price', 'Ativo', { login: 'X', senhaCifrada: 'S' }),
    p('Apura', 'Suspenso', { independente: true, link: 'LA', motivoFase: 'inadimplência' }),
    p('2D Nexus', 'Em breve'),
    p('Raptor', 'Cancelado', { motivoFase: 'cliente saiu' }),
  ];

  it('máquina 1.6 regrava o que recebeu (campos como texto JSON): nada muda de fase nem se perde', () => {
    const d = derivarCamposLegados(cadastro);
    // A 1.6 serializa arrays/objetos como texto e nunca recebe a senha cifrada.
    const patch = {
      servicos: JSON.stringify(d.servicos),
      servicosIndependentes: JSON.stringify(d.servicosIndependentes),
      linksServicos: JSON.stringify(d.linksServicos),
      loginPrice: d.loginPrice,
    };
    const r = traduzirPatchLegado(cadastro, patch, AGORA)!;
    expect(r).toHaveLength(cadastro.length);
    for (const original of cadastro) {
      const novo = r.find((x) => x.produto === original.produto)!;
      expect(novo).toMatchObject({
        fase: original.fase,
        faseDesde: original.faseDesde,
        motivoFase: original.motivoFase,
      });
      expect(Boolean(novo.independente)).toBe(Boolean(original.independente));
      expect(novo.link).toBe(original.link);
    }
    expect(r.find((x) => x.produto === '2D Price')!.senhaCifrada).toBe('S');
    expect(mudancasDeFase(cadastro, r)).toEqual([]);
  });

  it('Suspenso some de servicos/independentes derivados mas continua no cadastro com fase e motivo', () => {
    const d = derivarCamposLegados(cadastro);
    expect(d.servicos).not.toContain('Apura');
    expect(d.servicosIndependentes).not.toContain('Apura');
    const r = traduzirPatchLegado(cadastro, { servicos: ['Plataforma 2D'] }, AGORA)!;
    expect(r.find((x) => x.produto === 'Apura')).toMatchObject({ fase: 'Suspenso', motivoFase: 'inadimplência' });
    expect(r.find((x) => x.produto === '2D Nexus')!.fase).toBe('Em breve');
    expect(r.find((x) => x.produto === 'Raptor')!.fase).toBe('Cancelado');
  });

  it('patch da 1.6 com nome antigo e novo misturados conta uma vez e não cancela Plataforma 2D', () => {
    const r = traduzirPatchLegado(cadastro, { servicos: ['Monitoria', 'Plataforma 2D', 'Precificação'] }, AGORA)!;
    expect(r.filter((x) => x.produto === 'Plataforma 2D')).toHaveLength(1);
    expect(r.filter((x) => x.produto === '2D Price')).toHaveLength(1);
    expect(r.find((x) => x.produto === 'Plataforma 2D')).toEqual(cadastro[0]);
    expect(r.find((x) => x.produto === '2D Price')).toEqual(cadastro[1]);
    expect(r.some((x) => /monitoria|precifica/i.test(x.produto))).toBe(false);
  });

  it('link com chave antiga vai para o produto renomeado', () => {
    const r = traduzirPatchLegado(cadastro, { linksServicos: { Monitoria: 'novo', Apura: 'LA' } }, AGORA)!;
    expect(r.find((x) => x.produto === 'Plataforma 2D')!.link).toBe('novo');
    expect(r.find((x) => x.produto === '2D Price')!.link).toBeUndefined();
  });

  it('derivarCamposLegados aceita produtos como texto JSON e limpa login/senha sem 2D Price', () => {
    expect(derivarCamposLegados(JSON.stringify(cadastro)).servicos).toEqual(['Plataforma 2D', '2D Price']);
    expect(derivarCamposLegados([p('Apura', 'Ativo')])).toMatchObject({ loginPrice: '', senhaPriceCifrada: '' });
  });

  it('produto novo sem motivo é mudança com motivoMudou=false', () => {
    expect(mudancasDeFase(cadastro, [...cadastro, p('Raptor2', 'Ativo', { motivoFase: '  ' })])).toEqual([
      { produto: 'Raptor2', de: null, para: 'Ativo', motivoMudou: false },
    ]);
  });
});
