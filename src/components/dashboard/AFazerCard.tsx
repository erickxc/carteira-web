import { useState } from 'react';
import { format, isToday, parseISO } from 'date-fns';
import { Check, FileText } from 'lucide-react';
import { eventoStatusBadge } from '../../utils/badges';
import { corTipo, corTipoBg } from '../../utils/tipoCor';
import { Badge, Card, Chip, type BadgeVariant } from '../../ui';
import { Comparacao, InfoComoConta } from './Comparacao';
import type { Cliente, EventoAgenda } from '../../types';

interface AlertaCliente { cliente: Cliente; uc: Date | null | undefined; dias: number | null }

interface AFazerCardProps {
  /** Lista completa de sem acompanhamento (o card mostra 5 e oferece "ver todos"). */
  alertas: AlertaCliente[];
  totalAnterior: number;
  rotuloAnterior: string;
  followUpDays: number;
  /** Próximo compromisso de cada atendimento — troca o botão "Relatório" por "próx. dd/mm". */
  proximaPorCliente: Map<string, EventoAgenda>;
  programados: Set<string>;
  onAbrirCliente: (clienteId: string) => void;
  onProgramarRelatorio: (cliente: Cliente) => void;
  // Próximas agendas
  tiposDisponiveis: string[];
  filtroTipo: string;
  onFiltroTipo: (t: string) => void;
  proximos: EventoAgenda[];
  relatoriosSemana: EventoAgenda[];
  onVerAgenda: () => void;
  onSelecionarEvento: (ev: EventoAgenda) => void;
}

const VISIVEIS = 5;
type Aba = 'sem' | 'proximas';

function severidade(dias: number | null): BadgeVariant {
  if (dias === null || dias >= 60) return 'danger';
  return 'warning';
}

/**
 * "A fazer": sem acompanhamento e próximas agendas no mesmo card, em abas com a
 * mesma linha compacta (uma altura só, no máximo 5 linhas). As listas não se
 * misturam — uma é atraso, a outra é compromisso —, mas se cruzam: quem está sem
 * acompanhamento e já tem reunião marcada mostra a data em vez de "Relatório".
 */
export function AFazerCard(p: AFazerCardProps) {
  const [aba, setAba] = useState<Aba>('sem');
  const [todos, setTodos] = useState(false);
  const alertasVisiveis = todos ? p.alertas : p.alertas.slice(0, VISIVEIS);
  const clientesRelatorio = [...new Set(p.relatoriosSemana.map((r) => r.clientName))];

  function trocar(nova: Aba) {
    setAba(nova);
    setTodos(false);
  }

  return (
    <Card className="kpi-card afazer-card">
      <div className="section-header">
        <div className="kpi-abas" role="tablist" aria-label="A fazer">
          <button type="button" role="tab" aria-selected={aba === 'sem'} className={aba === 'sem' ? 'is-ativa' : ''} onClick={() => trocar('sem')}>
            Sem acompanhamento <span className="vencendo-total">{p.alertas.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={aba === 'proximas'} className={aba === 'proximas' ? 'is-ativa' : ''} onClick={() => trocar('proximas')}>
            Próximas agendas <span className="afazer-contagem">{p.proximos.length}</span>
          </button>
        </div>
        {aba === 'sem' ? (
          <span className="flex items-center gap-2">
            <Comparacao atual={p.alertas.length} anterior={p.totalAnterior} subirEhBom={false} rotulo={p.rotuloAnterior} />
            <InfoComoConta texto={`Atendimentos sem contato ou entrega CONCLUÍDOS há ${p.followUpDays}+ dias. Reunião cancelada ou ainda "Agendado" não conta. Quando já existe reunião marcada, a linha mostra a data.`} />
          </span>
        ) : (
          <button className="link-button" style={{ fontSize: 12 }} onClick={p.onVerAgenda}>ver agenda →</button>
        )}
      </div>

      {aba === 'sem' ? (
        p.alertas.length === 0 ? (
          <div className="empty-state">Todo atendimento teve contato nos últimos {p.followUpDays} dias.</div>
        ) : (
          <>
            <ul className="afazer-lista">
              {alertasVisiveis.map(({ cliente, uc, dias }) => {
                const proxima = p.proximaPorCliente.get(cliente.id);
                return (
                  <li key={cliente.id}>
                    <span className="afazer-principal">
                      <button className="link-button afazer-nome" onClick={() => p.onAbrirCliente(cliente.id)} title={cliente.empresa}>{cliente.empresa}</button>
                      <span className="afazer-sub">{cliente.monitor || 'sem monitor'} · {uc ? `últ. contato ${format(uc, 'dd/MM')}` : 'sem registro'}</span>
                    </span>
                    <Badge variant={severidade(dias)}>{dias === null ? 'sem histórico' : `${dias} dias`}</Badge>
                    <span className="afazer-acao">
                      {proxima ? (
                        <Badge variant="muted" title={`${proxima.type} marcada`}>próx. {format(parseISO(proxima.date), 'dd/MM')}</Badge>
                      ) : p.programados.has(cliente.id) ? (
                        <Badge variant="success"><Check size={12} /> Programado</Badge>
                      ) : (
                        <button className="link-button" style={{ fontSize: 12 }} onClick={() => p.onProgramarRelatorio(cliente)} title="Programar envio de relatório">
                          <FileText size={12} /> Relatório
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            {p.alertas.length > VISIVEIS && (
              <button type="button" className="gauge-toggle" onClick={() => setTodos((v) => !v)} aria-expanded={todos}>
                {todos ? 'Ver menos' : `Ver todos (${p.alertas.length})`}
              </button>
            )}
          </>
        )
      ) : (
        <>
          <div className="flex flex-wrap gap-[0.35rem] mb-2">
            {p.tiposDisponiveis.map((t) => (
              <Chip key={t} active={p.filtroTipo === t} onClick={() => p.onFiltroTipo(t)}>{t}</Chip>
            ))}
          </div>
          {p.relatoriosSemana.length > 0 && (
            <p className="kpi-como-conta" style={{ margin: '0 0 0.4rem' }}>
              <strong>{p.relatoriosSemana.length} {p.relatoriosSemana.length === 1 ? 'relatório' : 'relatórios'}</strong> nos próximos 7 dias: {clientesRelatorio.join(', ')}
            </p>
          )}
          {p.proximos.length === 0 ? (
            <div className="empty-state">Nenhuma agenda futura{p.filtroTipo !== 'Todos' ? ` de ${p.filtroTipo}` : ''}.</div>
          ) : (
            <ul className="afazer-lista">
              {p.proximos.map((ev) => {
                const d = parseISO(ev.date);
                return (
                  <li key={ev.id} className="is-clicavel" onClick={() => p.onSelecionarEvento(ev)}>
                    <span className={`afazer-data${isToday(d) ? ' is-hoje' : ''}`}>{isToday(d) ? 'hoje' : format(d, 'dd/MM')}{ev.time ? ` ${ev.time}` : ''}</span>
                    <span className="afazer-principal">
                      <span className="afazer-nome" title={ev.clientName}>{ev.clientName}</span>
                      <span className="afazer-sub">{ev.subject || ev.type}</span>
                    </span>
                    <Badge variant="plain" style={{ color: corTipo(ev.type), background: corTipoBg(ev.type) }}>{ev.type}</Badge>
                    <span className="afazer-acao"><Badge variant={eventoStatusBadge(ev.status)}>{ev.status}</Badge></span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}
