const { addMinutes, format, parseISO } = require('date-fns');

/**
 * Port server-side (CommonJS) de `src/utils/ata.ts` (`gerarAta`) — usado por
 * `server/ia/tools.cjs` (ferramenta `redigir_ata_reuniao`) quando o monitorIA
 * grava uma ata pelo chat. Precisa produzir EXATAMENTE o mesmo texto que o
 * `EventFormModal` produziria no navegador: `ev.ata` é lido de volta por
 * `ataPdf.cjs`/`ataPdf.ts` (`extrairSecaoAta`, procura os cabeçalhos "2. O QUE
 * FOI TRATADO" etc.) e por `analiseCliente.textoEvento` (dossiê) — um formato
 * diferente aqui quebraria os dois. Mesma duplicação (e o mesmo risco de
 * divergência) já aceito em `ataPdf.cjs`, pelo mesmo motivo: não dá pra
 * importar TS/ESM de dentro de um `.cjs` de servidor sem build step.
 */

const TRACO = '—';

function faixaHoraria(time, duracao) {
  if (!time) return '';
  if (!duracao || duracao <= 0) return time;
  const [h, m] = time.split(':').map(Number);
  if (isNaN(h)) return time;
  const inicio = new Date(2000, 0, 1, h, isNaN(m) ? 0 : m);
  return `${time}–${format(addMinutes(inicio, duracao), 'HH:mm')}`;
}

function itens(texto) {
  if (!texto || !texto.trim()) return [];
  return texto
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•—]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
}

/**
 * `ev` já deve vir com os campos JSON deserializados (checklist/monitores/
 * servicos/produtosSituacao via `listaJSON`) — quem chama é responsável.
 * `ctx.cliente.contatos` idem. `ia` são as 3 seções de `gerarAtaIA`
 * (server/ia/geracaoAta.cjs) — undefined pra gerar sem IA (heurística pura).
 */
function gerarAta(ev, ctx = {}, ia) {
  const L = [];
  const data = ev.date ? format(parseISO(ev.date), 'dd/MM/yyyy') : '';
  const horario = faixaHoraria(ev.time, ev.duracao);
  const tipo = /reuni/i.test(ev.type ?? '') ? 'ATA DE REUNIÃO' : `ATA ${TRACO} ${(ev.type ?? 'EVENTO').toUpperCase()}`;

  L.push(`${tipo} ${TRACO} ${ev.clientName ?? ''}`.trim());
  L.push([data, horario, ev.sala ? `Sala ${ev.sala}` : ''].filter(Boolean).join(' · '));
  const monitores = ev.monitores ?? [];
  if (monitores.length > 0) L.push(`Monitor${monitores.length > 1 ? 'es' : ''}: ${monitores.join(', ')}`);
  const servicos = ev.servicos ?? [];
  if (servicos.length > 0) L.push(`Serviços tratados: ${servicos.join(', ')}`);
  if (ev.subject && ev.subject.trim()) L.push(`Assunto: ${ev.subject.trim()}`);

  const doCliente = (ctx.participantesCliente && ctx.participantesCliente.filter(Boolean)) ?? (() => {
    const contatos = (ctx.cliente && ctx.cliente.contatos) ?? [];
    if (contatos.length === 0) return [];
    const doServico = servicos.length > 0
      ? contatos.filter((c) => (c.servicos ?? []).length === 0 || (c.servicos ?? []).some((s) => servicos.includes(s)))
      : contatos;
    return doServico.map((c) => (c.cargo ? `${c.nome} (${c.cargo})` : c.nome));
  })();
  const participantes = [
    ...doCliente.map((p) => `${p} ${TRACO} ${ev.clientName ?? 'cliente'}`),
    ...monitores.map((m) => `${m} ${TRACO} 2D Consultores`),
  ];
  if (participantes.length > 0) {
    L.push('', 'PARTICIPANTES');
    participantes.forEach((p) => L.push(`  ${TRACO} ${p}`));
  }

  const checklist = ev.checklist ?? [];
  L.push('', '1. PAUTA');
  if (checklist.length === 0) {
    L.push('   (sem pauta registrada)');
  } else {
    checklist.forEach((i) => L.push(`   [${i.done ? 'x' : ' '}] ${i.text}${i.done ? '' : '   (não tratado)'}`));
  }

  L.push('', '2. O QUE FOI TRATADO');
  const relato = (ev.resumo && ev.resumo.trim()) || (ev.description && ev.description.trim()) || '';
  const relatoFinal = (ia && ia.oQueFoiTratado && ia.oQueFoiTratado.trim()) || relato;
  if (relatoFinal) relatoFinal.split('\n').forEach((l) => L.push(`   ${l.trim()}`));
  else L.push('   (a preencher)');

  const registros = ev.produtosSituacao ?? [];
  if (registros.length > 0) {
    L.push('', 'REGISTRO DA MONITORIA');
    registros.forEach((r) => {
      const quem = [r.cliente, r.produto].filter(Boolean).join(' · ') || '(sem identificação)';
      const tag = r.tag ? ` [${r.tag}]` : '';
      const grupo = r.grupo ? ` (${r.grupo})` : '';
      L.push(`   ${TRACO} ${quem}: ${r.situacao}${tag}${grupo}`);
    });
  }

  L.push('', '3. DECISÕES');
  if (ia && ia.decisoes && ia.decisoes.trim()) {
    ia.decisoes.trim().split('\n').map((l) => l.trim()).filter(Boolean).forEach((d) => L.push(`   ${TRACO} ${d}`));
  } else {
    const decisoes = itens(relato).filter((l) => /^(decis|decidid|ficou\s+(definido|acordado)|acordad)/i.test(l));
    if (decisoes.length > 0) decisoes.forEach((d) => L.push(`   ${TRACO} ${d}`));
    else L.push('   (a preencher)');
  }

  const pendentes = checklist.filter((i) => !i.done).map((i) => i.text);
  const extrasIA = (ia && ia.proximosPassos && ia.proximosPassos.trim())
    ? ia.proximosPassos.trim().split('\n').map((l) => l.trim()).filter(Boolean)
    : [];
  L.push('', '4. PRÓXIMOS PASSOS');
  if (pendentes.length + extrasIA.length > 0) {
    pendentes.forEach((p) => L.push(`   [2D]      ${p}`));
    extrasIA.forEach((p) => L.push(`   ${/^\[.+?\]/.test(p) ? p : `[2D]      ${p}`}`));
  } else {
    L.push('   (a preencher)');
  }

  L.push('', `Ata gerada automaticamente pela Carteira de Monitoria ${TRACO} revise antes de enviar.`);
  return L.join('\n');
}

module.exports = { gerarAta };
