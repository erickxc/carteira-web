import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { CalendarCheck, CalendarClock, TrendingUp } from 'lucide-react';
import { calcularRecuperados, LIMIAR_RECUPERACAO_DIAS } from '../../utils/recuperados';
import { janelaDe, PERIODOS, type PeriodoKey } from '../../utils/periodo';
import { Badge, Card } from '../../ui';
import type { Cliente, EventoAgenda } from '../../types';

interface RecuperadosCardProps {
  clientes: Cliente[];
  agenda: EventoAgenda[];
}

/**
 * Clientes recuperados: estavam 2+ meses sem reunião nem relatório e voltaram a
 * ter um dos dois — realizado ou já marcado.
 *
 * KPI + lista (não gráfico de barras): o valor aqui está em saber QUAIS clientes
 * voltaram e quanto tempo ficaram parados, não na forma da distribuição. A
 * contagem sozinha não permite agir; a lista, sim.
 */
export function RecuperadosCard({ clientes, agenda }: RecuperadosCardProps) {
  const navigate = useNavigate();
  const [periodo, setPeriodo] = useState<PeriodoKey>('mes_atual');

  const agora = useMemo(() => new Date(), []);
  const janela = useMemo(() => janelaDe(periodo, agora), [periodo, agora]);
  const recuperados = useMemo(
    () => calcularRecuperados(clientes, agenda, janela, agora),
    [clientes, agenda, janela, agora]
  );

  const marcados = recuperados.filter((r) => !r.entrega.jaAconteceu).length;
  const realizados = recuperados.length - marcados;

  return (
    <Card flat className="recuperados-card">
      <div className="section-header" style={{ display: 'block', gap: 4 }}>
        <h3 style={{ marginBottom: 2 }}>Clientes recuperados</h3>
        <p className="atend-subtitulo">
          {janela.descricao} · voltaram a ter reunião ou relatório após {LIMIAR_RECUPERACAO_DIAS}+ dias parados
        </p>
      </div>

      <div className="flex-row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {PERIODOS.map((p) => (
          <button
            key={p.key}
            className={`filtro-btn${periodo === p.key ? ' is-active' : ''}`}
            onClick={() => setPeriodo(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="atend-big" style={{ marginBottom: recuperados.length > 0 ? 14 : 0 }}>
        <div className="atend-big-num">
          <TrendingUp size={18} className="shrink-0" />
          <strong>{recuperados.length}</strong>
        </div>
        <div className="atend-big-txt">
          <strong>{recuperados.length === 1 ? 'cliente recuperado' : 'clientes recuperados'}</strong>
          <span className="text-text-muted">
            {realizados} já com entrega realizada · {marcados} com entrega marcada
          </span>
        </div>
      </div>

      {recuperados.length === 0 ? (
        <div className="empty-state">Nenhum cliente recuperado nesse período.</div>
      ) : (
        <div className="recup-lista custom-scrollbar">
          {recuperados.map((r) => (
            <button
              key={r.cliente.id}
              className="recup-item"
              onClick={() => navigate(`/clientes/${r.cliente.id}`, { state: { from: '/', fromLabel: 'Visão Geral' } })}
              title="Abrir o cliente"
            >
              <div style={{ minWidth: 0, textAlign: 'left' }}>
                <strong style={{ fontSize: 14 }}>{r.cliente.empresa}</strong>
                <div className="flex-row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  <Badge variant="warning" style={{ fontSize: 10 }}>
                    {r.motivo === 'nunca' ? `${r.diasParado}d sem nunca ser atendido` : `${r.diasParado}d parado`}
                  </Badge>
                  <Badge variant="accent" style={{ fontSize: 10 }}>{r.entrega.tipo}</Badge>
                  {r.cliente.monitor && (
                    <span className="text-text-muted" style={{ fontSize: 12 }}>{r.cliente.monitor}</span>
                  )}
                </div>
              </div>
              <div className="recup-item-dir">
                <Badge variant={r.entrega.jaAconteceu ? 'success' : 'muted'} style={{ fontSize: 10 }}>
                  {r.entrega.jaAconteceu
                    ? <><CalendarCheck size={10} /> realizada</>
                    : <><CalendarClock size={10} /> marcada</>}
                </Badge>
                <span style={{ fontSize: 13 }} className="text-text-secondary">
                  {format(r.entrega.data, 'dd/MM/yyyy')}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
