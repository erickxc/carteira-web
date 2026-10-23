import { describe, expect, it } from 'vitest';
import { montarXmlToast } from './notificacaoReuniao.cjs';

// O texto vem da fala do cliente e do LLM: tudo escapado, nada vira XML.
describe('notificação grande da reunião', () => {
  const base = { titulo: 'Risco · Pecita', texto: 'Vendas caíram 18% (R$ 42 mil → R$ 34 mil)', icone: 'C:/x/bot.png', link: 'http://127.0.0.1:3011/agenda?evento=e1' };

  it('título, texto, acao, fontes e botão para o evento', () => {
    const xml = montarXmlToast({ ...base, acao: 'Pergunte do concorrente.', fontes: 'alvos.json' });
    expect(xml).toContain('<text hint-maxLines="2">Risco · Pecita</text>');
    expect(xml).toContain('<text>Vendas caíram 18% (R$ 42 mil → R$ 34 mil)</text>');
    expect(xml).toContain('<text>Pergunte do concorrente.</text>');
    expect(xml).toContain('<text placement="attribution">Fontes: alvos.json</text>');
    expect(xml).toContain('arguments="http://127.0.0.1:3011/agenda?evento=e1"');
    expect(xml).toContain('scenario="reminder"');
  });

  it('tira marcação markdown que o modelo devolve (asterisco viraria texto no balão)', () => {
    const xml = montarXmlToast({ ...base, texto: '**Leitura:** a conta de `maio` não _fecha_', acao: '**Pergunte** do preço' });
    expect(xml).toContain('<text>Leitura: a conta de maio não fecha</text>');
    expect(xml).toContain('<text>Pergunte do preço</text>');
  });

  it('corta texto e ação para caberem nas 4 linhas do balão', () => {
    const xml = montarXmlToast({ ...base, texto: 'a'.repeat(400), acao: 'b'.repeat(300) });
    const [texto, acao] = [...xml.matchAll(/<text>([^<]*)<\/text>/g)].map((m) => m[1]);
    expect(texto.length).toBeLessThanOrEqual(130);
    expect(texto.endsWith('…')).toBe(true);
    expect(acao.length).toBeLessThanOrEqual(80);
  });

  it('escapa caracteres de XML vindos da fala', () => {
    const xml = montarXmlToast({ ...base, texto: 'Cliente disse "<não> & pronto"' });
    expect(xml).toContain('Cliente disse &quot;&lt;não&gt; &amp; pronto&quot;');
  });

  it('sem fontes, sem ação e sem link: só os blocos que existem, e o Dispensar sempre', () => {
    // Testado em 23/10/2026: toast "reminder" SEM nenhum botão o Windows descarta em silêncio.
    const xml = montarXmlToast({ titulo: 'T', texto: 'X', icone: 'i.png' });
    expect(xml).not.toContain('attribution');
    expect(xml).not.toContain('Ver na Carteira');
    expect(xml).toContain('<action content="Dispensar" activationType="system" arguments="dismiss"/>');
    expect(xml.match(/<text/g)).toHaveLength(2);
  });
});
