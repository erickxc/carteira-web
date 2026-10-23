import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { aplicarRedacao, montarPopups, redigirPopups } from './popups.cjs';

// Os popups são montados DO DADO (investigar_produto): o modelo só escolhe e redige.
// Números abaixo = resultado real da Pecita/Bateria (21/10/2026), resumido.
const LOJAS = { pecita: 'Matriz', pecita_cg: 'Campo Grande', Pecita_seropedica: 'Seropédica', Pecita_top1000: 'Top1000' };
const r = {
  produto: 'Bateria', fim: '2026-10-21',
  serieMensal: [
    { per: 202511, qtd: 160, receita: 55000, margemPct: 22.0 }, { per: 202512, qtd: 170, receita: 58000, margemPct: 22.2 },
    { per: 202601, qtd: 175, receita: 59872.8, margemPct: 22.6 }, { per: 202602, qtd: 182, receita: 64352.5, margemPct: 22.6 },
    { per: 202603, qtd: 193, receita: 66208.5, margemPct: 21.8 }, { per: 202604, qtd: 176, receita: 64166, margemPct: 25.8 },
    { per: 202605, qtd: 170, receita: 64119.5, margemPct: 26.0 }, { per: 202606, qtd: 154, receita: 57772.5, margemPct: 25.5 },
    { per: 202607, qtd: 164, receita: 59819, margemPct: 26.3 }, { per: 202608, qtd: 156, receita: 58461.7, margemPct: 25.2 },
    { per: 202609, qtd: 139, receita: 51653.6, margemPct: 23.9 },
  ],
  porLoja: [
    { loja: 'Pecita_seropedica', diasCobertura: 23, excesso: 9, excessoRs: 2463, falta: 6 },
    { loja: 'Pecita_top1000', diasCobertura: 22, excesso: 6, excessoRs: 2152, falta: 2 },
    { loja: 'pecita', diasCobertura: 128, excesso: 91, excessoRs: 24390, falta: 0 },
    { loja: 'pecita_cg', diasCobertura: 54, excesso: 20, excessoRs: 7925, falta: 1 },
  ],
  transferencias: [
    { cod: '24706', fab: 'KRAFT', de: 'pecita', para: 'Pecita_top1000', un: 2 },
    { cod: '24706', fab: 'KRAFT', de: 'pecita', para: 'Pecita_seropedica', un: 1 },
    { cod: '41065', fab: 'HELIAR', de: 'pecita', para: 'Pecita_seropedica', un: 3 },
    { cod: '41703', fab: 'JMF KRAFT', de: 'pecita', para: 'pecita_cg', un: 1 },
  ],
  vendaMesmoPeriodo: [
    { loja: 'Pecita_seropedica', atual: 26, anterior: 32 }, { loja: 'Pecita_top1000', atual: 20, anterior: 23 },
    { loja: 'pecita', atual: 23, anterior: 24 }, { loja: 'pecita_cg', atual: 11, anterior: 18 }, { loja: null, atual: 80, anterior: 97 },
  ],
  clientesQueCairam: [{ ranking: 3, cliente: 'ROBERTO LEONARDO NONATO DA SILVA 0809520', unMesAntes: 1, unMesDepois: 0, ultimaCompra: '2026-06-09' }],
  promocao: [
    { produto: 'Kit Embreagem', excessoRs: 121969, diasCobertura: 45, margemPct: 18.1 },
    { produto: 'Amortecedor Suspensão', excessoRs: 58830, diasCobertura: 33, margemPct: 28.6 },
  ],
};

describe('popups montados do dado', () => {
  const ps = montarPopups(r, { nomesLoja: LOJAS, cliente: 'Pecita - Campo Grande' });
  const porTipo = (t: string) => ps.find((p: { tipo: string }) => p.tipo === t);

  // Pedido do usuário (23/10/2026): queda e margem já estão no gráfico; os números trazem o que ele não mostra.
  it('venda: números complementam o gráfico (lucro, estoque, pior loja agora)', () => {
    const v = porTipo('venda');
    expect(v.titulo).toBe('Bateria: vendas caíram 28% desde mar');
    expect(v.numeros).toEqual([
      { valor: 'R$ 12,3 mil', rotulo: 'lucro em set, o menor', neg: true },
      { valor: '128 dias', rotulo: 'de estoque na Matriz', neg: true },
      { valor: '−39%', rotulo: 'Campo Grande em out', neg: true },
    ]);
    expect(v.grafico.tipo).toBe('venda');
    expect(v.grafico.meses.at(-1)).toEqual({ rotulo: 'set', qtd: 139, margem: 23.9 });
    expect(v.acao).toEqual({ icone: 'ligar', titulo: 'Ligue para Roberto Leonardo Nonato da Silva', sub: '3º maior cliente, parou em junho' });
  });

  it('estoque: dias por loja com nome amigável, excesso e falta; ação de transferir', () => {
    const e = porTipo('estoque');
    expect(e.numeros.map((n: { valor: string }) => n.valor)).toEqual(['126 un', 'R$ 37 mil', '9 un']);
    expect(e.grafico).toEqual({ tipo: 'estoque', ideal: 17, lojas: [
      { nome: 'Matriz', dias: 128, alerta: true }, { nome: 'Campo Grande', dias: 54, alerta: true },
      { nome: 'Seropédica', dias: 23, alerta: false }, { nome: 'Top1000', dias: 22, alerta: false },
    ] });
    // Sem 'da/do' antes do nome da loja: o artigo depende do nome ("da Matriz", "de Itaguaí").
    expect(e.acao).toEqual({ icone: 'transferir', titulo: 'Transfira 7 un de Matriz', sub: 'bateria para Top1000, Seropédica e Campo Grande' });
  });

  it('promoção: prefere item com margem para desconto (≥ 25%)', () => {
    const p = porTipo('promocao');
    expect(p.acao.titulo).toBe('Proponha promoção de amortecedor suspensão');
    expect(p.numeros[0]).toEqual({ valor: 'R$ 59 mil', rotulo: 'acima do máximo' });
  });

  it('sem dado suficiente, não monta o popup daquele tipo', () => {
    const vazio = montarPopups({ produto: 'X', serieMensal: [], porLoja: [], transferencias: [], clientesQueCairam: [], promocao: [] }, { nomesLoja: {} });
    expect(vazio).toEqual([]);
  });

  it('redação do modelo: só título e ação, com teto; id inexistente é ignorado', () => {
    const final = aplicarRedacao(ps, [
      { id: 'venda', titulo: 'Bateria: a alta de margem passou do ponto e agora o lucro também está caindo muito' },
      { id: 'inventado', titulo: 'X' },
    ]);
    expect(final).toHaveLength(1);
    expect(final[0].titulo.length).toBeLessThanOrEqual(60);
    expect(final[0].numeros).toEqual(porTipo('venda').numeros);
  });
});

describe('redação dos popups a partir da fala do cliente', () => {
  const ps = montarPopups(r, { nomesLoja: LOJAS, cliente: 'Pecita - Campo Grande' });
  const fala = 'A bateria não está vendendo, e não dá pra baixar a margem por causa da concorrência';

  it('o modelo escolhe a ordem e escreve títulos ligados à fala; números ficam do dado', async () => {
    const llm = { gerarJSON: vi.fn(async () => ({ popups: [
      { id: 'estoque', titulo: 'Sem mexer no preço: 7 baterias de Itaguaí cobrem as outras lojas' },
      { id: 'venda', titulo: 'Bateria caiu 28% desde que a margem subiu' },
    ] })) };
    const final = await redigirPopups({ llm, fala, popups: ps });
    expect(final.map((p: { tipo: string }) => p.tipo)).toEqual(['estoque', 'venda']);
    expect(final[0].titulo).toBe('Sem mexer no preço: 7 baterias de Itaguaí cobrem as outras…');
    expect(final[0].titulo.length).toBeLessThanOrEqual(60);
    expect(final.every((p: { fala: string }) => p.fala === fala)).toBe(true);
    expect(final[1].numeros).toEqual(ps.find((p: { tipo: string }) => p.tipo === 'venda').numeros);
    const prompt = llm.gerarJSON.mock.calls[0][0] as string;
    expect(prompt).toContain(fala);
    expect(prompt).toContain('128 dias');
  });

  it('modelo fora do ar: popups com o título padrão e a fala', async () => {
    const llm = { gerarJSON: vi.fn(async () => { throw new Error('fora'); }) };
    const final = await redigirPopups({ llm, fala, popups: ps });
    expect(final).toHaveLength(ps.length);
    expect(final[0]).toMatchObject({ titulo: ps[0].titulo, fala });
  });
});
