import { useEffect, useRef, useState, type FormEvent } from 'react';
import { format, parseISO } from 'date-fns';
import { Bot, Check, ChevronRight, History, Loader2, Send } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { buscarAcoesIA, enviarMensagemChatIA, type MensagemChatIA } from '../api/client';
import { toastError } from '../utils/toast';
import { usePersistedState } from '../hooks/usePersistedState';
import { Badge, Button, Card, Select, Textarea } from '../ui';
import RespostaIA from '../components/ia/RespostaIA';
import type { AcaoIA } from '../types';

// Fallback só pra ações antigas, registradas antes de `descricao` existir
// (`server/ia/orquestrador.cjs`, `descreverAcao`) — a legenda de verdade,
// com contexto real (cliente, filtro usado), vem pronta do backend.
const FERRAMENTA_LABEL: Record<string, string> = {
  buscar_clientes: 'Buscou clientes',
  buscar_dossie_cliente: 'Consultou dossiê',
  buscar_registros_produto: 'Consultou registros de produto',
  corrigir_dossie_cliente: 'Corrigiu dossiê',
  criar_evento: 'Criou evento',
  criar_lembrete: 'Criou lembrete',
  gerar_relatorio_executivo: 'Gerou relatório executivo',
};
const legendaAcao = (a: AcaoIA) => a.descricao ?? FERRAMENTA_LABEL[a.ferramenta] ?? a.ferramenta;

/**
 * As únicas ferramentas que ALTERAM dado. O agente executa sem pedir
 * confirmação (decisão do usuário), então o log é a peça que dá revisão
 * depois — e nele "consultou o dossiê" e "reescreveu o dossiê" não podem ter
 * o mesmo peso visual. Espelha `FERRAMENTAS_ESCRITA` em
 * `server/routes/iaProvedor.cjs`.
 */
const FERRAMENTAS_ESCRITA = new Set(['criar_evento', 'criar_lembrete', 'corrigir_dossie_cliente']);

// A legenda vem em gerúndio porque serve também ao progresso ao vivo
// ("Buscando clientes..."). No log, que é passado, o "..." fica estranho.
const legendaLog = (a: AcaoIA) => legendaAcao(a).replace(/\.\.\.$/, '');

/**
 * Colapsa repetições consecutivas da MESMA ação. O loop de ferramentas
 * costuma repetir a mesma chamada em passos seguidos (visto na tela: a mesma
 * "Verificando quem está sem acompanhamento" duas vezes no mesmo minuto), e
 * três cards idênticos empurram o resto do histórico pra fora da vista sem
 * informar nada. Guarda a ocorrência mais recente e conta as demais.
 */
function agruparRepetidas(lista: AcaoIA[]): { acao: AcaoIA; repeticoes: number }[] {
  const grupos: { acao: AcaoIA; repeticoes: number }[] = [];
  for (const a of lista) {
    const ultimo = grupos[grupos.length - 1];
    const mesma = ultimo
      && ultimo.acao.ferramenta === a.ferramenta
      && legendaLog(ultimo.acao) === legendaLog(a)
      && (ultimo.acao.clientId || '') === (a.clientId || '');
    if (mesma) ultimo.repeticoes += 1;
    else grupos.push({ acao: a, repeticoes: 1 });
  }
  return grupos;
}

/**
 * Sugestões do estado vazio. Existem porque as ferramentas do agente eram
 * invisíveis: quem abria a tela via uma frase cinza num vazio de 500px e não
 * tinha como saber que dá pra perguntar de cadência, encaixe de agenda ou
 * cobertura de contato. Cada uma exercita uma ferramenta diferente, e o texto
 * é a pergunta LITERAL que vai pro campo — não um rótulo que o usuário
 * precise traduzir.
 */
const SUGESTOES: { titulo: string; pergunta: string }[] = [
  { titulo: 'Aderência da carteira', pergunta: 'Quantos % da carteira estão com a cadência em dia?' },
  { titulo: 'Quem agendar agora', pergunta: 'Quem eu devo agendar essa semana?' },
  { titulo: 'Sem contato há mais tempo', pergunta: 'Quais clientes estão sem nenhum contato há mais tempo?' },
  { titulo: 'Vencendo em breve', pergunta: 'Algum cliente vence a cadência nos próximos dias?' },
  { titulo: 'Serviço descoberto', pergunta: 'Quem contratou Precificação e não está sendo atendido?' },
  { titulo: 'Panorama de risco', pergunta: 'Gera um relatório executivo da carteira.' },
];

/**
 * Módulo dedicado do monitorIA (assistente de IA) — orquestração agêntica
 * (`server/ia/orquestrador.cjs`): chat livre sobre qualquer cliente/produto
 * da carteira, com ferramentas que consultam e criam dado de verdade (evento,
 * lembrete). Diferente do card `AnaliseIACard` (na ficha do cliente, só
 * mostra a análise automática) — aqui é onde se conversa com o agente e se
 * audita o que ele já fez.
 */
export default function AssistenteIAPage() {
  const { clientes } = useCarteira();
  const [clienteId, setClienteId] = useState('');
  const [mensagens, setMensagens] = useState<MensagemChatIA[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [acoes, setAcoes] = useState<AcaoIA[]>([]);
  const [historicoAberto, setHistoricoAberto] = usePersistedState('assistenteIA:historicoAberto', false);
  const fimListaRef = useRef<HTMLDivElement>(null);

  function recarregarAcoes() {
    buscarAcoesIA().then(setAcoes).catch((err) => toastError(err instanceof Error ? err.message : 'Falha ao buscar log de ações.'));
  }

  useEffect(() => { recarregarAcoes(); }, []);
  useEffect(() => { fimListaRef.current?.scrollIntoView({ block: 'nearest' }); }, [mensagens]);

  // Passos do fluxo agêntico em andamento, pra mostrar progresso de verdade
  // em vez de um "pensando..." genérico — sem streaming do backend, a única
  // forma de saber o que está rolando AGORA é reaproveitar o log de auditoria
  // (`AcoesIA`, já gravado por ferramenta chamada) via polling curto durante a
  // espera. Cada ferramenta nova que aparece no log entra na lista; some
  // quando a resposta final chega.
  const [passosEmAndamento, setPassosEmAndamento] = useState<AcaoIA[]>([]);

  async function handleEnviar(e: FormEvent) {
    e.preventDefault();
    const pergunta = texto.trim();
    if (!pergunta || enviando) return;
    setTexto('');
    setEnviando(true);
    setPassosEmAndamento([]);
    const historico = mensagens;
    setMensagens((prev) => [...prev, { role: 'user', content: pergunta }]);

    const desde = new Date().toISOString();
    const polling = setInterval(() => {
      buscarAcoesIA()
        .then((todas) => setPassosEmAndamento(todas.filter((a) => a.criadoEm > desde)))
        .catch(() => { /* falha no polling não é crítica — só perde o progresso ao vivo */ });
    }, 1200);

    try {
      const { resposta } = await enviarMensagemChatIA(pergunta, historico, clienteId || undefined);
      setMensagens((prev) => [...prev, { role: 'assistant', content: resposta }]);
      recarregarAcoes();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Falha ao falar com o monitorIA.');
      setMensagens((prev) => prev.slice(0, -1));
      setTexto(pergunta);
    } finally {
      clearInterval(polling);
      setPassosEmAndamento([]);
      setEnviando(false);
    }
  }

  return (
    <div className="page-container">
      <h1 className="page-title" style={{ marginBottom: 4 }}><Bot size={22} style={{ marginRight: 8, verticalAlign: -4 }} /> monitorIA</h1>
      <p className="text-text-muted" style={{ marginBottom: 20, fontSize: '0.85rem' }}>
        Converse sobre qualquer cliente ou produto da carteira. O agente pode consultar dossiês/análises, corrigir o dossiê de um cliente quando você apontar um erro, e criar evento/lembrete — nunca edita ou exclui Cliente, Agenda ou Lembrete.
      </p>

      <div className="flex-row" style={{ alignItems: 'flex-start', gap: 16 }}>
        <Card flat style={{ flex: 1, minWidth: 0 }}>
          <div className="section-header">
            <h3>Conversa</h3>
            <div className="flex items-center gap-2">
              <div style={{ minWidth: 200 }}>
                <Select tone="modal" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                  <option value="">Sem cliente em foco</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.empresa}</option>)}
                </Select>
              </div>
              {!historicoAberto && (
                <Button
                  variant="secondary"
                  onClick={() => setHistoricoAberto(true)}
                  title="Ver o que o agente já executou"
                  style={{ padding: '0.35rem 0.55rem', whiteSpace: 'nowrap' }}
                >
                  <History size={14} />
                  {acoes.length > 0 && <span style={{ fontSize: 12 }}>{acoes.length}</span>}
                </Button>
              )}
            </div>
          </div>

          {/* Altura: sem conversa, encolhe e centraliza as sugestões (o
              `minHeight: 480` fixo era o que criava o vazio de meia tela); com
              conversa, cresce até o limite da viewport como antes. */}
          <div
            className="flex flex-col gap-2"
            style={{
              minHeight: mensagens.length === 0 && !enviando ? 340 : 480,
              maxHeight: 'calc(100vh - 320px)',
              overflowY: 'auto',
              marginBottom: 8,
              justifyContent: mensagens.length === 0 && !enviando ? 'center' : 'flex-start',
            }}
          >
            {mensagens.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-2">
                <Bot size={44} style={{ color: 'var(--text-muted)', opacity: 0.35 }} />
                <p className="text-[0.86rem] text-text-secondary text-center" style={{ maxWidth: '30rem' }}>
                  Pergunte sobre qualquer cliente, produto ou métrica da carteira — ou comece por uma destas:
                </p>
                <div className="w-full grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(15rem, 1fr))', maxWidth: '44rem' }}>
                  {SUGESTOES.map((s) => (
                    <button
                      key={s.pergunta}
                      type="button"
                      onClick={() => setTexto(s.pergunta)}
                      className="text-left p-2.5 rounded-sm bg-bg border border-border cursor-pointer transition-colors hover:border-accent hover:bg-card-hover"
                    >
                      <span className="block text-[0.78rem] font-semibold text-text-primary">{s.titulo}</span>
                      <span className="block text-[0.75rem] text-text-muted mt-0.5">{s.pergunta}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              mensagens.map((m, i) => (
                <div
                  key={i}
                  className={`px-3.5 py-2.5 text-[0.85rem] break-words${m.role === 'user' ? ' whitespace-pre-wrap' : ''}`}
                  style={{
                    alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    background: m.role === 'user' ? 'var(--accent-soft)' : 'var(--bg)',
                    // Sem borda na bolha do assistente (só fundo) e canto
                    // "mordido" no lado de quem fala — é o que faz ler como
                    // chat em vez de card empilhado.
                    border: m.role === 'user' ? '1px solid var(--border)' : '1px solid transparent',
                    borderRadius: m.role === 'user' ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
                  }}
                >
                  {/* Fala do agente passa pelo renderizador de markdown: os
                      modelos devolvem `**negrito**` e bullets, que apareciam
                      crus (linhas de asterisco no meio da resposta). A fala do
                      usuário fica texto puro — ele escreveu o que escreveu, e
                      interpretar markdown do lado dele só mudaria o que ele vê
                      de volta. */}
                  {m.role === 'assistant' ? <RespostaIA texto={m.content} /> : m.content}
                </div>
              ))
            )}
            {/* Sem streaming (a resposta só chega inteira no final, depois de
                todo o loop de tool-calling no backend — pode levar vários
                segundos) — sem isso a tela ficava sem nenhum feedback durante
                a espera, parecendo travada. */}
            {enviando && (
              <div
                className="p-2.5 rounded text-[0.85rem] flex flex-col gap-1.5 text-text-muted"
                style={{ alignSelf: 'flex-start', maxWidth: '85%', background: 'var(--bg)', border: '1px solid var(--border)' }}
              >
                {passosEmAndamento.length === 0 ? (
                  <span className="flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> monitorIA está pensando...</span>
                ) : (
                  passosEmAndamento.map((a, i) => (
                    <span key={a.id} className="flex items-center gap-2">
                      {i === passosEmAndamento.length - 1
                        ? <Loader2 size={13} className="animate-spin shrink-0" />
                        : <Check size={13} className="shrink-0" style={{ color: 'var(--success-fg)' }} />}
                      {legendaAcao(a)}
                    </span>
                  ))
                )}
              </div>
            )}
            <div ref={fimListaRef} />
          </div>

          {/* Botão de enviar DENTRO da moldura do campo (canto inferior
              direito), não flutuando ao lado — é o padrão que se reconhece de
              chat, e evita o textarea "encolher" pra caber um botão irmão. */}
          <form onSubmit={handleEnviar} style={{ position: 'relative' }}>
            <Textarea
              tone="modal"
              placeholder="Escreva sua pergunta..."
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEnviar(e); } }}
              style={{ minHeight: 44, width: '100%', paddingRight: '3rem' }}
            />
            <Button
              type="submit"
              variant="primary"
              disabled={enviando || !texto.trim()}
              title="Enviar (Enter)"
              aria-label="Enviar"
              style={{ position: 'absolute', right: 8, bottom: 8, padding: '0.3rem 0.5rem' }}
            >
              <Send size={14} />
            </Button>
          </form>
        </Card>

        {/* Histórico de ações — só existe como painel quando aberto. Recolhido
            ele virava um "talo" de card flutuando ao lado da conversa, sem
            função visual; agora quem abre é o botão no cabeçalho da conversa. */}
        {historicoAberto && (
        <Card flat style={{ width: 320, flexShrink: 0 }}>
          <div className="section-header">
            <h3 style={{ whiteSpace: 'nowrap' }}>
              <History size={15} style={{ marginRight: 4, verticalAlign: -2 }} />
              Ações do agente
              {acoes.length > 0 && <span className="text-text-muted" style={{ fontWeight: 400, fontSize: 12, marginLeft: 6 }}>({acoes.length})</span>}
            </h3>
            <button
              type="button"
              onClick={() => setHistoricoAberto(false)}
              className="sidebar-collapse-btn shrink-0 flex items-center justify-center w-7 h-7 rounded-sm text-text-muted bg-transparent border-none cursor-pointer hover:bg-card-hover hover:text-text-primary transition-colors"
              title="Fechar histórico"
              aria-label="Fechar histórico"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {acoes.length === 0 ? (
            <p className="text-[0.82rem] text-text-muted">Nenhuma ação executada ainda.</p>
          ) : (
            <div className="flex flex-col gap-2" style={{ maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' }}>
              {agruparRepetidas(acoes).map(({ acao: a, repeticoes }) => {
                const escreveu = FERRAMENTAS_ESCRITA.has(a.ferramenta);
                return (
                  <div
                    key={a.id}
                    className="p-2.5 rounded bg-bg border"
                    // Ação de escrita ganha borda de destaque: é o que precisa
                    // ser encontrado rápido ao revisar o que o agente fez.
                    style={{ borderColor: escreveu ? 'var(--warning-fg)' : 'var(--border)' }}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-[0.8rem] font-semibold text-text-primary">{legendaLog(a)}</span>
                      <span className="text-[0.7rem] text-text-muted ml-auto shrink-0">{format(parseISO(a.criadoEm), 'dd/MM HH:mm')}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                      {escreveu && <Badge variant="warning">alterou dado</Badge>}
                      {repeticoes > 1 && <Badge variant="muted">{repeticoes}x</Badge>}
                      {a.clientId && (
                        <span className="text-[0.75rem] text-text-muted">
                          {clientes.find((c) => c.id === a.clientId)?.empresa ?? a.clientId}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
        )}
      </div>
    </div>
  );
}
