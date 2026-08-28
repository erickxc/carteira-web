import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { format, parseISO } from 'date-fns';
import { Bot, Check, ChevronRight, History, Loader2, Plus, Send } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { buscarAcoesIA, enviarMensagemChatIA, type AlertaIA, type MensagemChatIA, type PadraoCarteira } from '../api/client';
import { toastError } from '../utils/toast';
import { usePersistedState } from '../hooks/usePersistedState';
import { Badge, Button, Card, Select, Textarea } from '../ui';
import RespostaIA from '../components/ia/RespostaIA';
import AlertasIA from '../components/ia/AlertasIA';
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
  buscar_memoria: 'Consultou as regras do processo',
  registrar_memoria: 'Guardou uma regra do processo',
  remover_memoria: 'Apagou uma regra do processo',
};
const legendaAcao = (a: AcaoIA) => a.descricao ?? FERRAMENTA_LABEL[a.ferramenta] ?? a.ferramenta;

/**
 * As únicas ferramentas que ALTERAM dado. O agente executa sem pedir
 * confirmação (decisão do usuário), então o log é a peça que dá revisão
 * depois — e nele "consultou o dossiê" e "reescreveu o dossiê" não podem ter
 * o mesmo peso visual. Espelha `FERRAMENTAS_ESCRITA` em
 * `server/routes/iaProvedor.cjs`.
 */
const FERRAMENTAS_ESCRITA = new Set(['criar_evento', 'criar_lembrete', 'corrigir_dossie_cliente', 'registrar_memoria', 'remover_memoria']);

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
  const { clientes, filtroMonitor } = useCarteira();
  // Cliente em foco também persiste: voltar pra tela com a conversa de um
  // cliente mas o seletor zerado faria a próxima pergunta perder o contexto.
  const [clienteId, setClienteId] = usePersistedState('assistenteIA:clienteId', '');
  // A conversa vive no localStorage, não em `useState`: a página é
  // desmontada ao navegar pra qualquer outra rota, e voltar zerava o
  // histórico inteiro — inclusive o contexto que o backend precisa receber de
  // volta a cada mensagem (a rota de chat é stateless, o frontend é quem
  // reenvia o histórico).
  //
  // localStorage e não servidor de propósito: o app não tem autenticação e é
  // servido na LAN, então uma conversa gravada no banco seria a conversa de
  // TODO MUNDO misturada, sem dono. Por navegador, cada pessoa tem a sua.
  const [mensagens, setMensagens] = usePersistedState<MensagemChatIA[]>('assistenteIA:conversa', []);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  // Muda a cada resposta do agente — força o AlertasIA a recarregar (ver
  // comentário em enviarPergunta).
  const [versaoAlertas, setVersaoAlertas] = useState(0);
  const [acoesBrutas, setAcoesBrutas] = useState<AcaoIA[]>([]);
  // Ninguém deveria ver o que outro monitor conversou com o agente — o app
  // não tem login, então a única identidade possível é o filtro global de
  // monitor (o que a própria pessoa escolheu no header). Sem filtro
  // ("Todos"), não dá pra saber de quem é o quê, então mostra tudo.
  const acoes = useMemo(
    () => (filtroMonitor === 'Todos' ? acoesBrutas : acoesBrutas.filter((a) => a.monitor === filtroMonitor)),
    [acoesBrutas, filtroMonitor],
  );
  const [historicoAberto, setHistoricoAberto] = usePersistedState('assistenteIA:historicoAberto', false);
  const fimListaRef = useRef<HTMLDivElement>(null);

  /**
   * Teto de mensagens guardadas. Duas razões: `localStorage` costuma ter ~5MB
   * por origem, e o histórico inteiro é REENVIADO ao modelo a cada pergunta —
   * uma conversa infinita viraria custo crescente por mensagem. Corta as mais
   * antigas, que é o que menos importa numa conversa de trabalho.
   */
  const MAX_MENSAGENS = 40;

  function novaConversa() {
    setMensagens([]);
    setTexto('');
  }

  function recarregarAcoes() {
    buscarAcoesIA().then(setAcoesBrutas).catch((err) => toastError(err instanceof Error ? err.message : 'Falha ao buscar log de ações.'));
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
    await enviarPergunta(texto);
  }

  /**
   * Abre a conversa a partir de um cartão de alerta: foca o cliente do alerta
   * (pra que as próximas perguntas herdem o contexto dele) e já dispara a
   * pergunta pronta — só preencher o campo deixaria um clique a mais no
   * caminho, que é justamente o que o cartão existe pra tirar.
   */
  function conversarSobreAlerta(alerta: AlertaIA | PadraoCarteira) {
    // Padrão de carteira não tem cliente — não mexe no foco, senão a
    // conversa herdaria um clientId vazio e o seletor voltaria pra "Sem
    // cliente em foco" sem o usuário ter pedido.
    if (alerta.clientId) setClienteId(alerta.clientId);
    enviarPergunta(alerta.pergunta);
  }

  async function enviarPergunta(bruto: string) {
    const pergunta = bruto.trim();
    if (!pergunta || enviando) return;
    setTexto('');
    setEnviando(true);
    setPassosEmAndamento([]);
    const historico = mensagens;
    setMensagens((prev) => [...prev, { role: 'user' as const, content: pergunta }].slice(-MAX_MENSAGENS));

    const desde = new Date().toISOString();
    const polling = setInterval(() => {
      buscarAcoesIA()
        .then((todas) => setPassosEmAndamento(todas.filter((a) => a.criadoEm > desde)))
        .catch(() => { /* falha no polling não é crítica — só perde o progresso ao vivo */ });
    }, 1200);

    try {
      const { resposta } = await enviarMensagemChatIA(pergunta, historico, clienteId || undefined, filtroMonitor === 'Todos' ? undefined : filtroMonitor);
      setMensagens((prev) => [...prev, { role: 'assistant' as const, content: resposta }].slice(-MAX_MENSAGENS));
      recarregarAcoes();
      // O agente pode ter criado evento/lembrete, corrigido o dossiê ou
      // registrado uma memória — qualquer um desses muda o que "precisa de
      // atenção agora". Sem isso, os cards de alerta só atualizavam com F5
      // ou o botão de recarregar manual, o que parecia "não atualizou".
      setVersaoAlertas((v) => v + 1);
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

      {/* Fora do card da conversa, de propósito: um alerta não pode sumir só
          porque o usuário mandou uma mensagem — ele continua precisando de
          atenção até ser resolvido, não até a tela rolar. */}
      <div style={{ marginBottom: 18 }}>
        <AlertasIA onConversar={conversarSobreAlerta} recarregarEm={versaoAlertas} />
      </div>

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
              {/* A conversa agora sobrevive a sair da tela (localStorage), então
                  passa a ser necessário um jeito explícito de começar do zero —
                  antes bastava navegar pra outra página. */}
              {mensagens.length > 0 && (
                <Button
                  variant="secondary"
                  onClick={novaConversa}
                  title="Começar uma conversa nova (apaga o histórico desta tela)"
                  style={{ padding: '0.35rem 0.55rem', whiteSpace: 'nowrap' }}
                >
                  <Plus size={14} /> Nova
                </Button>
              )}
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
                  Pergunte sobre qualquer cliente, produto ou métrica da carteira:
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
              chat. Antes usava `position: absolute` sobre o Textarea nativo
              (`resize-y`) — a alça de redimensionar do navegador ocupa o MESMO
              canto, e arrastar/redimensionar deixava o botão visualmente fora
              da moldura arredondada. Agora a moldura é um wrapper flex (borda
              própria) com o textarea SEM borda/fundo dentro — o botão nunca
              escapa porque é um irmão flex, não posicionamento absoluto sobre
              um elemento que muda de tamanho. */}
          <form
            onSubmit={handleEnviar}
            className="flex items-end gap-1.5 w-full border border-border-strong rounded-sm bg-bg transition-[border-color,box-shadow] duration-100 focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--accent-soft)]"
          >
            <Textarea
              placeholder="Escreva sua pergunta..."
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEnviar(e); } }}
              className="border-none bg-transparent hover:border-none focus:border-none focus:shadow-none group-hover:border-none group-hover:shadow-none resize-none"
              style={{ minHeight: 44 }}
            />
            <Button
              type="submit"
              variant="primary"
              disabled={enviando || !texto.trim()}
              title="Enviar (Enter)"
              aria-label="Enviar"
              style={{ margin: 6, padding: '0.3rem 0.5rem', flexShrink: 0 }}
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
