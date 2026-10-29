// Insights ao vivo da reunião: a cada checagem (3 min, quem chama é a sessão)
// uma chamada leve, sem ferramentas, lê o trecho novo da transcrição contra o
// histórico do cliente. As regras de barulho (não repetir assunto, pauta só na
// 2ª metade, 1 notificação a cada 2 min) ficam no código, não no prompt.
const crypto = require('crypto');

const INTERVALO_NOTIFICACAO_MS = 2 * 60_000;
const ROTULOS = { historico: 'Histórico', compromisso: 'Compromisso', pauta: 'Pauta', risco: 'Risco', analise: 'Análise' };

function montarPromptInsights({ cliente, dossie, analise, evento, resumoAnterior, trechoNovo, jaEnviados = [], podePauta }) {
  const pauta = [evento?.subject, evento?.description].filter(Boolean).join('\n');
  return `Você é o monitorIA, acompanhando AO VIVO uma reunião da 2D Consultores com um cliente.
Seu trabalho é avisar o monitor, em tempo real, só do que merece interromper a conversa.

CLIENTE: ${cliente?.empresa ?? '(reunião sem cliente vinculado)'}
PAUTA DA REUNIÃO:
${pauta || '(sem pauta)'}

${dossie ? `DOSSIÊ DO CLIENTE:\n${dossie}\n` : ''}${analise ? `ÚLTIMA ANÁLISE: risco ${analise.nivelRisco ?? '?'} — ${analise.resumo ?? ''}\n` : ''}
RESUMO DO QUE JÁ FOI DITO: ${resumoAnterior || '(início da reunião)'}

TRECHO NOVO DA TRANSCRIÇÃO:
${trechoNovo}

JÁ AVISADO (não repita): ${jaEnviados.map((i) => i.chave).join(', ') || 'nada'}

Tipos de aviso:
- "historico": o que foi dito cruza com algo do histórico/dossiê (ex.: problema que já apareceu e não foi tratado).
- "compromisso": alguém se comprometeu com algo (quem, o quê, quando).
- "pauta": assunto da pauta que ainda não entrou na conversa.${podePauta ? '' : ' AGORA: não use o tipo "pauta".'}
- "risco": cliente falou em cancelar, reduzir serviço, ou mostrou insatisfação.

Regras:
- Na dúvida, não avise. Zero avisos é a resposta normal da maioria das checagens.
- "titulo" com até 60 caracteres: a conclusão, como manchete (é o que aparece no popup; sem texto corrido). Ex.: "Edivan caiu de R$ 15,5 mil para R$ 12,2 mil".
- "texto" com até 220 caracteres, em português simples: o que foi dito (cite o cliente quando couber) e por que importa (com número do histórico/dossiê quando houver).
- "acao" com até 120 caracteres: o que fazer agora na conversa (pergunta a fazer, ponto a firmar). Pode ser vazio.
- "chave": 1 a 3 palavras que identificam o ASSUNTO (o mesmo assunto sempre gera a mesma chave).
- Ata vazia ou não preenchida nunca é assunto.
- "investigar": SÓ para o que é crítico e vale cruzar com os dados de venda/histórico (cancelamento, redução de serviço, queixa de resultado, número contestado pelo cliente). "oQueDisse" = a fala do cliente, curta.

Responda SÓ com JSON:
{"resumo": "resumo cumulativo da reunião até agora, até 600 caracteres", "insights": [{"tipo": "...", "titulo": "...", "texto": "...", "acao": "...", "chave": "..."}], "investigar": [{"chave": "...", "oQueDisse": "...", "porque": "..."}]}`;
}

function criarCicloInsights({ repo, evento, llm, notificar, aoInvestigar, agora = () => Date.now(), lerDossie }) {
  const cliente = repo.get('Clientes').find((c) => String(c.id) === String(evento?.clientId));
  const analise = cliente ? repo.get('AnalisesIA').find((a) => String(a.clientId) === String(cliente.id)) : undefined;
  let dossie = null;
  if (cliente) {
    try {
      dossie = (lerDossie ?? require('../ia/analisesAutomaticas.cjs').lerDossieCliente)(cliente.id);
    } catch { dossie = null; }
  }
  // O cabeçalho do toast já diz 'CARTEIRA 2D - monitorIA': o título leva tipo + cliente.
  const nome = cliente?.empresa ?? evento?.subject ?? 'reunião';
  const inicio = agora();
  const metadeMs = ((Number(evento?.duracao) || 60) * 60_000) / 2;

  const aceitos = [];
  const chaves = new Set();
  const pendentes = [];
  let ultimaNotificacao = -Infinity;
  let resumo = '';

  function despachar() {
    if (!pendentes.length || agora() - ultimaNotificacao < INTERVALO_NOTIFICACAO_MS) return;
    // Um aviso por notificação: com texto detalhado, juntar dois fica ilegível.
    const item = pendentes.shift();
    ultimaNotificacao = agora();
    try {
      notificar({ titulo: `${ROTULOS[item.tipo]} · ${nome}`, mensagem: item.texto, acao: item.acao, fontes: item.fontes,
        manchete: item.titulo, rotulo: ROTULOS[item.tipo], cliente: nome });
    } catch (err) { console.warn(`reunião: notificação falhou — ${err.message}`); }
  }

  function aceitar(insight) {
    const chave = String(insight?.chave ?? '').trim().toLowerCase();
    if (!chave || !ROTULOS[insight.tipo] || !String(insight.texto ?? '').trim() || chaves.has(chave)) return;
    if (insight.tipo === 'pauta' && agora() - inicio < metadeMs) return;
    chaves.add(chave);
    const item = { ...insight, chave, texto: String(insight.texto).trim(), em: new Date(agora()).toISOString() };
    aceitos.push(item);
    pendentes.push(item);
  }

  function adicionar(insight) {
    aceitar(insight);
    despachar();
  }

  async function rodar(trechoNovo) {
    if (!String(trechoNovo ?? '').trim()) return;
    const prompt = montarPromptInsights({
      cliente, dossie, analise, evento, resumoAnterior: resumo, trechoNovo,
      jaEnviados: aceitos, podePauta: agora() - inicio >= metadeMs,
    });
    const uso = {};
    const t0 = Date.now();
    let saida;
    try {
      saida = await llm.gerarJSON(prompt, { coletarUso: uso });
    } catch (err) {
      console.warn(`reunião: checagem de insights falhou — ${err.message}`);
      return;
    }
    if (repo && uso.modelo !== undefined) {
      try {
        const { registrarUso } = require('../ia/uso.cjs');
        const { provedorAtivo } = require('../ia/provider.cjs');
        registrarUso(repo, {
          origem: 'reuniao-ao-vivo', provedor: provedorAtivo(), modelo: uso.modelo, turnId: crypto.randomUUID(),
          inputTokens: uso.inputTokens, outputTokens: uso.outputTokens,
          cacheCreationTokens: uso.cacheCreationTokens, cacheReadTokens: uso.cacheReadTokens,
          custoUsd: uso.custoUsd ?? 0, duracaoMs: Date.now() - t0, pergunta: trechoNovo, resposta: uso.resposta ?? '',
        });
      } catch { /* medição nunca derruba a reunião */ }
    }
    if (typeof saida?.resumo === 'string') resumo = saida.resumo.slice(0, 600);
    for (const i of Array.isArray(saida?.insights) ? saida.insights : []) aceitar(i);
    despachar();
    for (const item of Array.isArray(saida?.investigar) ? saida.investigar : []) {
      if (item?.chave) aoInvestigar?.(item);
    }
  }

  return { rodar, adicionar, despachar, enviados: () => aceitos.slice(), resumo: () => resumo };
}

module.exports = { montarPromptInsights, criarCicloInsights };
