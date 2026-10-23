import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { renderPopup } = require('./render.cjs');

// O mesmo arquivo roda na janela do popup (navegador) e aqui (Node): só monta string.
const base = { cliente: 'Pecita - Campo Grande', titulo: 'Bateria: a alta de margem passou do ponto',
  numeros: [{ valor: '−28%', rotulo: 'vendas desde mar', neg: true }, { valor: '23,9%', rotulo: 'margem em set' }, { valor: 'R$ 12,3 mil', rotulo: 'lucro em set', neg: true }],
  acao: { icone: 'ligar', titulo: 'Ligue para Roberto Leonardo Nonato da Silva', sub: '3º maior cliente, parou em junho' } };

// Barras do gráfico (o ícone do robô no cabeçalho também tem um <rect>).
const barras = (html: string) => (html.match(/<svg class="g"[\s\S]*?<\/svg>/)?.[0] ?? '').match(/<rect /g) ?? [];

describe('render do popup', () => {
  it('venda: barras por mês, linha de margem e marco', () => {
    const html = renderPopup({ ...base, tipo: 'venda', grafico: { tipo: 'venda', marco: { indice: 3, rotulo: 'margem 25,8%' },
      meses: [{ rotulo: 'jan', qtd: 175, margem: 22.6 }, { rotulo: 'fev', qtd: 182, margem: 22.6 }, { rotulo: 'mar', qtd: 193, margem: 21.8 }, { rotulo: 'abr', qtd: 176, margem: 25.8 }, { rotulo: 'set', qtd: 139, margem: 23.9 }] } });
    expect(barras(html)).toHaveLength(5);
    expect(html).toContain('<polyline');
    expect(html).toContain('margem 25,8%');
    expect(html).toContain('>139<');
    expect(html).toContain('class="neg">−28%');
    expect(html).toContain('Ligue para Roberto Leonardo Nonato da Silva');
  });

  it('estoque: uma barra por loja e a linha do ideal', () => {
    const html = renderPopup({ ...base, tipo: 'estoque', grafico: { tipo: 'estoque', ideal: 17, lojas: [{ nome: 'Matriz', dias: 128, alerta: true }, { nome: 'Seropédica', dias: 23, alerta: false }] } });
    expect(barras(html)).toHaveLength(2);
    expect(html).toContain('ideal até 17 dias');
    expect(html).toContain('128 dias');
  });

  it('promoção: uma barra por produto com a margem no rótulo', () => {
    const html = renderPopup({ ...base, tipo: 'promocao', grafico: { tipo: 'promocao', itens: [{ nome: 'Amortecedor Suspensão', rs: 58830, margem: 28.6, destaque: true }, { nome: 'Aditivo', rs: 62094, margem: 27.6 }] } });
    expect(barras(html)).toHaveLength(2);
    expect(html).toContain('28,6%');
    expect(html).toContain('R$ 59 mil');
  });

  it('mostra a fala do cliente acima do título (o popup responde a ela)', () => {
    const html = renderPopup({ ...base, tipo: 'estoque', fala: 'a bateria não está <vendendo>', grafico: { tipo: 'estoque', ideal: 17, lojas: [] } });
    expect(html).toContain('<p class="fala">“a bateria não está &lt;vendendo&gt;”</p>');
    expect(html.indexOf('class="fala"')).toBeLessThan(html.indexOf('<h1>'));
    expect(renderPopup({ ...base, tipo: 'estoque', grafico: { tipo: 'estoque', ideal: 17, lojas: [] } })).not.toContain('class="fala"');
  });

  it('escapa texto vindo do modelo ou do cadastro', () => {
    const html = renderPopup({ ...base, tipo: 'estoque', titulo: '<img src=x onerror=alert(1)>', grafico: { tipo: 'estoque', ideal: 17, lojas: [] } });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});
