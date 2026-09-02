import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { AlertTriangle, CalendarCheck, TrendingUp } from 'lucide-react';
import { calcularAindaSemAtendimento, calcularRecuperados, LIMIAR_RECUPERACAO_DIAS } from '../../utils/recuperados';
import { janelaDe, periodosDisponiveis, type PeriodoKey } from '../../utils/periodo';
import { Badge, Card } from '../../ui';
import type { Cliente, EventoAgenda } from '../../types';

interface RecuperadosCardProps {
  clientes: Cliente[];
  agenda: EventoAgenda[];
  /** Âncora de "agora" — vem do filtro de mês/ano do Dashboard (ver
   *  `useDashboardData.dataReferencia`), não mais `new Date()` fixo. */
  agora: Date;
}

/**
 * Clientes recuperados: estavam 2+ meses sem reunião nem relatório e voltaram a
 * ter um dos dois — realizado ou já marcado.
 *
 * KPI + lista (não gráfico de barras): o valor aqui está em saber QUAIS clientes
 * voltaram e quanto tempo ficaram parados, não na forma da distribuição. A
 * contagem sozinha não permite agir; a lista, sim.
 */
export function RecuperadosCard({ clientes, agenda, agora }: RecuperadosCardProps) {
  const navigate = useNavigate();
  // Padrão = trimestre: cobre os "últimos 2 meses" pedidos, sem depender de
  // onde estamos no mês corrente (dia 2 do mês, "mês atual" mostraria quase nada).
  const [periodo, setPeriodo] = useState<PeriodoKey>('trimestre');
  /** Alterna entre a lista de recuperados e a de quem segue parado. */
  const [aba, setAba] = useState<'recuperados' | 'parados'>('recuperados');

  const janela = useMemo(() => janelaDe(periodo, agora), [periodo, agora]);

  const periodos = useMemo(() => {
    let maisAntiga: Date | null = null;
    for (const e of agenda) {
      if (!e.date) continue;
      const d = new Date(e.date);
      if (isNaN(d.getTime())) continue;
      if (!maisAntiga || d < maisAntiga) maisAntiga = d;
    }
    return periodosDisponiveis(maisAntiga, agora);
  }, [agenda, agora]);

  const recuperados = useMemo(
    () => calcularRecuperados(clientes, agenda, janela, agora),
    [clientes, agenda, janela, agora]
  );
  // Não depende do período: é uma foto de agora ("quem ainda está parado hoje").
  const parados = useMemo(() => calcularAindaSemAtendimento(clientes, agenda, agora), [clientes, agenda, agora]);

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
        {periodos.map((p) => (
          <button
            key={p.key}
            className={`filtro-btn${periodo === p.key ? ' is-active' : ''}`}
            onClick={() => setPeriodo(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Dois números lado a lado: recuperados no período x quem segue parado
          hoje. Sem o segundo, "5 recuperados" não diz se sobraram 2 ou 30. */}
      <div className="recup-duo">
        <button
          className={`recup-kpi${aba === 'recuperados' ? ' is-active' : ''}`}
          onClick={() => setAba('recuperados')}
          title={`Voltaram a ter reunião ou relatório concluído após ${LIMIAR_RECUPERACAO_DIAS}+ dias parados`}
        >
          <span className="recup-kpi-num"><TrendingUp size={16} /> {recuperados.length}</span>
          <span className="recup-kpi-label">recuperados</span>
          <span className="recup-kpi-nota">
            {recuperados.length === 0 ? 'no período' : partes.join(' · ')}
          </span>
        </button>
        <button
          className={`recup-kpi is-alerta${aba === 'parados' ? ' is-active' : ''}`}
          onClick={() => setAba('parados')}
          title={`Clientes ativos sem nenhuma reunião/relatório concluído há ${LIMIAR_RECUPERACAO_DIAS}+ dias. Suspenso, Problemas Externos e Atendido pelo Marco não entram.`}
        >
          <span className="recup-kpi-num"><AlertTriangle size={16} /> {parados.length}</span>
          <span className="recup-kpi-label">ainda sem atendimento</span>
          <span className="recup-kpi-nota">hoje · exclui Marco e suspensos</span>
        </button>
      </div>

      {aba === 'parados' ? (
        parados.length === 0 ? (
          <div className="empty-state">Nenhum cliente ativo parado há {LIMIAR_RECUPERACAO_DIAS}+ dias.</div>
        ) : (
          <div className="recup-lista custom-scrollbar">
            {parados.map((p) => (
              <button
                key={p.cliente.id}
                className="recup-item"
                onClick={() => navigate(`/clientes/${p.cliente.id}`, { state: { from: '/', fromLabel: 'Visão Geral' } })}
                title="Abrir o cliente"
              >
                <div style={{ minWidth: 0, textAlign: 'left' }}>
                  <strong style={{ fontSize: 13.5 }}>{p.cliente.empresa}</strong>
                  <div className="flex-row" style={{ gap: 5, flexWrap: 'wrap', marginTop: 3 }}>
                    <Badge variant="danger" style={{ fontSize: 10 }}>
                      {p.diasSemEntrega === null ? 'nunca atendido' : `${p.diasSemEntrega}d parado`}
                    </Badge>
                    {p.cliente.monitor && (
                      <span className="text-text-muted" style={{ fontSize: 11.5 }}>{p.cliente.monitor}</span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )
      ) : recuperados.length === 0 ? (
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
                  <Badge variant="muted" style={{ fontSize: 10 }} title={r.motivo === 'nunca' ? 'Nunca havia sido atendido' : 'Dias sem reunião nem relatório'}>
                    {r.diasParado}d parado
                  </Badge>
                  <Badge variant="accent" style={{ fontSize: 10 }}>{r.entrega.tipo}</Badge>
                  {/* Monitor de QUEM FEZ a entrega (evento), não o da carteira:
                      a reunião pode ter sido feita por outro monitor. */}
                  {r.entrega.monitor && (
                    <span className="text-text-muted" style={{ fontSize: 11.5 }}>{r.entrega.monitor}</span>
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
