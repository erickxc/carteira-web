import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { popupDeInsight } = require('./popup.cjs');
const { renderPopup } = require('./popup/render.cjs');

// Sugestão da reunião no formato aprovado: título-conclusão + 1 ação, nunca texto corrido.
describe('popup de sugestão da reunião', () => {
  it('usa a manchete como título, rótulo e cliente no cabeçalho, sem números vazios', () => {
    const p = popupDeInsight({ manchete: 'Edivan caiu de R$ 15,5 mil para R$ 12,2 mil', mensagem: 'texto longo '.repeat(30), acao: 'Pergunte do kit de embreagem', rotulo: 'Histórico', cliente: 'Renocar' });
    expect(p).toMatchObject({ titulo: 'Edivan caiu de R$ 15,5 mil para R$ 12,2 mil', cliente: 'Histórico · Renocar', acao: { titulo: 'Pergunte do kit de embreagem' } });
    const html = renderPopup(p);
    expect(html).not.toContain('texto longo');
    expect(html).not.toContain('class="numeros"');
    expect(html).not.toContain('<small>');
  });

  it('sem manchete, corta o texto em 60 caracteres', () => {
    expect(popupDeInsight({ mensagem: 'a'.repeat(100) }).titulo).toHaveLength(60);
  });

  it('um popup por vez: o próximo só abre quando o anterior fecha', () => {
    vi.resetModules();
    delete require.cache[require.resolve('./popup.cjs')];
    const popup = require('./popup.cjs');
    const janelas: (EventEmitter & { exitCode: number | null })[] = [];
    const spawnar = vi.fn(() => { const j = Object.assign(new EventEmitter(), { exitCode: null as number | null }); janelas.push(j); return j; });
    const opcoes = { spawnar, temWebView2: () => true };
    popup.mostrarInsight({ manchete: 'A' }, opcoes);
    popup.mostrarInsight({ manchete: 'B' }, opcoes);
    expect(spawnar).toHaveBeenCalledTimes(1);
    janelas[0].exitCode = 0;
    janelas[0].emit('exit', 0);
    expect(spawnar).toHaveBeenCalledTimes(2);
  });
});
