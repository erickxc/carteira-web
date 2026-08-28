import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Coins, RefreshCw, Wrench } from 'lucide-react';
import { buscarUsoIA, type TurnoUsoIA, type UsoIAResposta } from '../../api/client';
import { Badge, Card } from '../../ui';

/**
 * Painel de consumo de IA — tokens e custo por pergunta, nos dois provedores.
 *
 * O que NÃO existe aqui, de propósito: "quanto falta da cota da assinatura até
 * resetar". Isso só aparece no site da Anthropic, atrelado à sessão do
 * navegador — não à credencial OAuth que o Claude Code CLI usa. Conferido
 * inspecionando o log de debug do CLI (`claude -p ... --debug`): nenhuma
 * chamada HTTP dele carrega cabeçalho de rate-limit/cota, só o resultado da
 * própria resposta. O que É real e o que este painel mostra: tokens e custo
 * de CADA resposta, que é o que sustenta "quanto estamos gastando".
 *
 * Cada linha é uma PERGUNTA (`turnId`), expansível pra ver as ferramentas que
 * ela chamou — entrada/saída de cada uma — o mais perto que dá de chegar de
 * "ver o agente chamando função" sem instrumentação de terceiro.
 */
const DIAS_OPCOES = [1, 7, 30] as const;

function formatarTokens(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatarUsd(n: number) {
  return n === 0 ? 'grátis' : `$${n.toFixed(4)}`;
}

export default function UsoIACard() {
  const [dias, setDias] = useState<(typeof DIAS_OPCOES)[number]>(7);
  const [dados, setDados] = useState<UsoIAResposta | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [turnoAberto, setTurnoAberto] = useState<string | null>(null);

  // `buscar` não mexe em estado de forma síncrona — é o que o efeito chama
  // (mesmo padrão de AlertasIA.tsx: o lint do projeto barra setState direto
  // no corpo de um efeito).
  const buscar = useCallback((d: number) => buscarUsoIA(d).then(setDados).catch(() => setDados(null)), []);
  useEffect(() => { buscar(dias); }, [dias, buscar]);

  function carregar(d: number) {
    setCarregando(true);
    buscar(d).finally(() => setCarregando(false));
  }

  if (!dados) return null;

  const { totais, turnos } = dados;
  const totalTokens = totais.inputTokens + totais.outputTokens + totais.cacheCreationTokens + totais.cacheReadTokens;

  return (
    <Card flat>
      <div className="section-header">
        <h3><Coins size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />Consumo do monitorIA</h3>
        <div className="flex items-center gap-2">
          {DIAS_OPCOES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDias(d)}
              className={`tab${dias === d ? ' is-active' : ''}`}
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
            >
              {d === 1 ? 'Hoje' : `${d}d`}
            </button>
          ))}
          <button
            type="button"
            onClick={() => carregar(dias)}
            disabled={carregando}
            title="Recalcular"
            aria-label="Recalcular"
            className="flex items-center justify-center w-6 h-6 rounded-sm text-text-muted bg-transparent border-none cursor-pointer hover:bg-card-hover hover:text-text-primary transition-colors"
          >
            <RefreshCw size={13} className={carregando ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <p className="text-text-secondary" style={{ fontSize: '0.78rem', marginBottom: 14 }}>
        Tokens e custo de cada pergunta. Não é "quanto resta da assinatura até resetar" — essa cota só aparece
        no site da Anthropic (o CLI não expõe isso); aqui é gasto real medido por resposta.
      </p>

      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '10px 14px', fontSize: '0.8rem', margin: '0 0 16px' }}>
        <div>
          <dt className="text-text-secondary" style={{ fontSize: '0.72rem' }}>Perguntas</dt>
          <dd style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>{totais.perguntas}</dd>
        </div>
        <div>
          <dt className="text-text-secondary" style={{ fontSize: '0.72rem' }}>Tokens totais</dt>
          <dd style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>{formatarTokens(totalTokens)}</dd>
        </div>
        <div>
          <dt className="text-text-secondary" style={{ fontSize: '0.72rem' }}>Custo</dt>
          <dd style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>{formatarUsd(totais.custoUsd)}</dd>
        </div>
        {totais.erros > 0 && (
          <div>
            <dt className="text-text-secondary" style={{ fontSize: '0.72rem' }}>Falharam</dt>
            <dd style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--danger-fg)' }}>{totais.erros}</dd>
          </div>
        )}
      </dl>

      {turnos.length === 0 ? (
        <p className="text-[0.82rem] text-text-muted">Nenhuma pergunta nesse período.</p>
      ) : (
        <div className="flex flex-col gap-1.5" style={{ maxHeight: 360, overflowY: 'auto' }}>
          {turnos.map((t: TurnoUsoIA) => {
            const aberto = turnoAberto === t.id;
            return (
              <div key={t.id} className="rounded-sm bg-bg border border-border">
                <button
                  type="button"
                  onClick={() => setTurnoAberto(aberto ? null : t.id)}
                  className="w-full flex items-center gap-2 p-2 bg-transparent border-none cursor-pointer text-left"
                >
                  {aberto ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />}
                  <span className="text-[0.78rem] text-text-muted shrink-0">{new Date(t.criadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  <Badge variant="muted" className="shrink-0">{t.origem}</Badge>
                  {t.numFerramentas > 0 && (
                    <span className="text-[0.75rem] text-text-muted flex items-center gap-1 shrink-0">
                      <Wrench size={11} /> {t.numFerramentas}
                    </span>
                  )}
                  <span className="ml-auto text-[0.78rem] text-text-muted shrink-0">
                    {formatarTokens(t.inputTokens + t.outputTokens + t.cacheCreationTokens + t.cacheReadTokens)} tok
                    {t.custoUsd !== null && ` · ${formatarUsd(t.custoUsd)}`}
                  </span>
                  {t.erro && <Badge variant="danger" className="shrink-0">erro</Badge>}
                </button>

                {aberto && (
                  <div className="px-3 pb-2.5 flex flex-col gap-2" style={{ fontSize: '0.75rem' }}>
                    <div className="text-text-secondary">
                      {t.modelo && <><code>{t.modelo}</code> · </>}
                      entrada {t.inputTokens} · saída {t.outputTokens}
                      {t.cacheCreationTokens > 0 && ` · cache criado ${formatarTokens(t.cacheCreationTokens)}`}
                      {t.cacheReadTokens > 0 && ` · cache lido ${formatarTokens(t.cacheReadTokens)}`}
                      {' · '}{(t.duracaoMs / 1000).toFixed(1)}s
                    </div>
                    {t.ferramentas.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        {t.ferramentas.map((f, i) => (
                          <details key={i} className="rounded-sm" style={{ background: 'var(--bg-elevated, rgba(127,127,127,0.08))', padding: '6px 8px' }}>
                            <summary style={{ cursor: 'pointer', display: 'flex', gap: 6, alignItems: 'center' }}>
                              <Wrench size={11} /> <code>{f.ferramenta}</code>
                              <span className="text-text-muted" style={{ fontWeight: 400 }}>{f.descricao}</span>
                            </summary>
                            <div className="mt-1.5 flex flex-col gap-1">
                              <div>
                                <strong className="text-text-secondary">entrada:</strong>{' '}
                                <code style={{ wordBreak: 'break-all' }}>{JSON.stringify(f.argumentos)}</code>
                              </div>
                              <div>
                                <strong className="text-text-secondary">saída:</strong>{' '}
                                <code style={{ wordBreak: 'break-all' }}>{JSON.stringify(f.resultado).slice(0, 500)}</code>
                              </div>
                            </div>
                          </details>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
