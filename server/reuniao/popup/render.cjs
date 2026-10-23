// Desenho do popup do monitorIA (formato aprovado em 23/10/2026): título-conclusão,
// 3 números, gráfico e 1 ação. Roda na janela do popup (navegador) e no Node (testes):
// só monta string, sem DOM. Todo texto passa por esc() — vem do modelo e do cadastro.
(function (raiz) {
  const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const pct1 = (v) => `${Number(v).toFixed(1).replace('.', ',')}%`;
  const reais = (v) => (v >= 1e6 ? `R$ ${(v / 1e6).toFixed(1).replace('.', ',')} mi` : v >= 2e4 ? `R$ ${Math.round(v / 1e3)} mil` : v >= 1e3 ? `R$ ${(v / 1e3).toFixed(1).replace('.', ',')} mil` : `R$ ${Math.round(v)}`);

  const ICONES = {
    bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
    fechar: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    ligar: '<path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/>',
    transferir: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
    promover: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
    comprar: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
    perguntar: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  };
  const icone = (nome, classe = '') => `<svg class="${classe}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nome] || ''}</svg>`;

  function graficoVenda(g) {
    const m = g.meses || [];
    if (!m.length) return '';
    const W = 364, topo = 14, base = 74, l = W / m.length, bar = Math.min(20, l * 0.55);
    const maxQ = Math.max(...m.map((x) => x.qtd)) * 1.09;
    const mgs = m.map((x) => x.margem), minM = Math.min(...mgs) - 3, maxM = Math.max(...mgs) + 1;
    const yU = (v) => base - (v / maxQ) * (base - topo), yM = (v) => base - ((v - minM) / (maxM - minM)) * (base - topo), x = (i) => i * l + l / 2;
    const marco = g.marco ? g.marco.indice : m.length;
    let s = m.map((n, i) => `<rect class="${i === m.length - 1 ? 'a' : i >= marco ? 'q' : 'b'}" x="${(x(i) - bar / 2).toFixed(1)}" y="${yU(n.qtd).toFixed(1)}" width="${bar.toFixed(1)}" height="${(base - yU(n.qtd)).toFixed(1)}" rx="3"/><text x="${x(i).toFixed(1)}" y="${base + 15}" text-anchor="middle">${esc(n.rotulo)}</text>`).join('');
    const ult = m[m.length - 1];
    s += `<text class="forte" x="${x(m.length - 1).toFixed(1)}" y="${(yU(ult.qtd) - 5).toFixed(1)}" text-anchor="middle">${Math.round(ult.qtd)}</text>`;
    if (g.marco) {
      const xm = x(g.marco.indice) - l / 2;
      s += `<line class="marco" x1="${xm.toFixed(1)}" x2="${xm.toFixed(1)}" y1="${topo - 6}" y2="${base}"/><text class="ouro" x="${(xm + 5).toFixed(1)}" y="${topo}">${esc(g.marco.rotulo)}</text>`;
    }
    s += `<polyline class="linha" points="${m.map((n, i) => `${x(i).toFixed(1)},${yM(n.margem).toFixed(1)}`).join(' ')}"/>`;
    return `<svg class="g" viewBox="0 0 364 92" role="img" aria-label="Unidades vendidas por mês e margem">${s}</svg>`;
  }

  function graficoEstoque(g) {
    const lojas = g.lojas || [];
    const W = 364, esq = 92, dir = 56, h = 18, gap = 9, max = Math.max(g.ideal * 2, ...lojas.map((l) => l.dias)) * 1.02;
    const xx = (d) => esq + (d / max) * (W - esq - dir), altura = lojas.length * (h + gap);
    let s = `<line class="marco" x1="${xx(g.ideal).toFixed(1)}" x2="${xx(g.ideal).toFixed(1)}" y1="0" y2="${altura - gap + 4}"/>`;
    s += `<text class="ouro" x="${xx(g.ideal).toFixed(1)}" y="${altura + 8}" text-anchor="middle">ideal até ${g.ideal} dias</text>`;
    lojas.forEach((l, i) => {
      const y = i * (h + gap);
      s += `<text x="0" y="${y + 13}">${esc(l.nome)}</text>`;
      s += `<rect class="${l.alerta ? 'a' : 'b'}" x="${xx(0)}" y="${y + 2}" width="${(xx(l.dias) - xx(0)).toFixed(1)}" height="${h - 4}" rx="3"/>`;
      s += `<text class="${l.alerta ? 'neg' : 'forte'}" x="${(xx(l.dias) + 6).toFixed(1)}" y="${y + 13}">${l.dias} dias</text>`;
    });
    return `<svg class="g" viewBox="0 0 364 ${altura + 14}" role="img" aria-label="Dias de estoque por loja e o ideal do giro">${s}</svg>`;
  }

  function graficoPromocao(g) {
    const itens = g.itens || [];
    const W = 364, esq = 150, dir = 70, h = 18, gap = 9, max = Math.max(...itens.map((x) => x.rs)) * 1.05;
    const xx = (v) => esq + (v / max) * (W - esq - dir);
    const s = itens.map((it, i) => {
      const y = i * (h + gap);
      return `<text x="0" y="${y + 13}"><tspan class="forte">${esc(it.nome)}</tspan> · ${pct1(it.margem)}</text>`
        + `<rect class="${it.destaque ? 'q' : 'b'}" x="${xx(0)}" y="${y + 2}" width="${(xx(it.rs) - xx(0)).toFixed(1)}" height="${h - 4}" rx="3"/>`
        + `<text class="forte" x="${(xx(it.rs) + 6).toFixed(1)}" y="${y + 13}">${reais(it.rs)}</text>`;
    }).join('');
    return `<svg class="g" viewBox="0 0 364 ${itens.length * (h + gap)}" role="img" aria-label="Estoque acima do máximo por produto que vende todo mês">${s}</svg>`;
  }

  const GRAFICOS = { venda: graficoVenda, estoque: graficoEstoque, promocao: graficoPromocao };

  function renderPopup(p) {
    const g = p.grafico || {};
    return `<article class="popup">
      <header class="cabeca">${icone('bot')}<span>monitorIA · ${esc(p.cliente)}</span><span class="quando">agora</span>
        <button type="button" class="fechar" data-fechar aria-label="Fechar">${icone('fechar')}</button></header>
      ${p.fala ? `<p class="fala">“${esc(p.fala)}”</p>` : ''}
      <h1>${esc(p.titulo)}</h1>
      <div class="numeros">${(p.numeros || []).map((n) => `<div><strong${n.neg ? ' class="neg"' : ''}>${esc(n.valor)}</strong><span>${esc(n.rotulo)}</span></div>`).join('')}</div>
      ${GRAFICOS[g.tipo] ? GRAFICOS[g.tipo](g) : ''}
      <div class="acao">${icone(p.acao?.icone || 'perguntar')}
        <div><b>${esc(p.acao?.titulo)}</b><small>${esc(p.acao?.sub)}</small></div>
        <button type="button" data-feito>Feito</button></div>
    </article>`;
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { renderPopup };
  else raiz.renderPopup = renderPopup;
})(typeof window !== 'undefined' ? window : globalThis);
