import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { CalendarCheck, TrendingUp } from 'lucide-react';
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

  const porTipo = recuperados.reduce(
    (acc, r) => {
      if (/relat/i.test(r.entrega.tipo)) acc.relatorio++; else acc.reuniao++;
      return acc;
    },
    { reuniao: 0, relatorio: 0 }
  );

  // Plural por extenso: concatenar sufixo daria "reuniãoões".
  const partes = [
    porTipo.reuniao > 0 ? `${porTipo.reuniao} ${porTipo.reuniao > 1 ? 'reuniões' : 'reunião'}` : null,
    porTipo.relatorio > 0 ? `${porTipo.relatorio} ${porTipo.relatorio > 1 ? 'relatórios' : 'relatório'}` : null,
  ].filter(Boolean);

  return (
    <Card flat className="recuperados-card">
      <div className="section-header" style={{ display: 'block', gap: 4 }}>
        <h3 style={{ marginBottom: 2 }}>Clientes recuperados</h3>
        <p
          className="atend-subtitulo"
          title={`${janela.descricao} — clientes que voltaram a ter reunião ou relatório CONCLUÍDO após ${LIMIAR_RECUPERACAO_DIAS}+ dias sem nenhum atendimento`}
        >
          {janela.curta} · voltaram após {LIMIAR_RECUPERACAO_DIAS}+ dias parados
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
            {recuperados.length === 0 ? 'só conta entrega concluída' : partes.join(' · ')}
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
                <strong style={{ fontSize: 13.5 }}>{r.cliente.empresa}</strong>
                <div className="flex-row" style={{ gap: 5, flexWrap: 'wrap', marginTop: 3 }}>
                  <Badge variant="warning" style={{ fontSize: 10 }} title={r.motivo === 'nunca' ? 'Nunca havia sido atendido' : 'Dias sem reunião nem relatório'}>
                    {r.diasParado}d parado
                  </Badge>
                  <Badge variant="accent" style={{ fontSize: 10 }}>{r.entrega.tipo}</Badge>
                  {r.cliente.monitor && (
                    <span className="text-text-muted" style={{ fontSize: 11.5 }}>{r.cliente.monitor}</span>
                  )}
                </div>
              </div>
              {/* Badge "concluída" saiu: o card já diz que só conta concluída. */}
              <div className="recup-item-dir">
                <CalendarCheck size={12} className="text-[color:var(--success)] shrink-0" />
                <span style={{ fontSize: 12.5 }} className="text-text-secondary">
                  {format(r.entrega.data, 'dd/MM/yy')}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
