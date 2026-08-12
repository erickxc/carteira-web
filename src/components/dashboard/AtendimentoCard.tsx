import { useMemo, useState } from 'react';
import { CalendarSync, PhoneCall, PhoneIncoming } from 'lucide-react';
import {
  calcularCicloAtendimento, calcularConfiabilidade, calcularEsforcoAgenda, formatarDias,
} from '../../utils/metricasAtendimento';
import { Card } from '../../ui';
import type { Acao, Cliente, EventoAgenda } from '../../types';

interface AtendimentoCardProps {
  agenda: EventoAgenda[];
  clientes: Cliente[];
  acoes: Acao[];
}

/** Janelas de análise. 0 = todo o histórico. */
const PERIODOS = [
  { label: '90 dias', dias: 90 },
  { label: '6 meses', dias: 180 },
  { label: '12 meses', dias: 365 },
  { label: 'Tudo', dias: 0 },
];

/** Cores semânticas do desfecho — verde/amarelo/vermelho, não a paleta da marca:
 *  aqui a cor carrega o significado (deu certo / escorregou / não aconteceu). */
const CORES = {
  realizadas: 'var(--success)',
  reagendadas: 'var(--warning)',
  canceladas: 'var(--danger)',
};

/**
 * Card de qualidade do ATENDIMENTO. Junta três leituras que respondem à mesma
 * pergunta ("estamos atendendo bem e com que esforço?"):
 *  - desfecho das reuniões (realizada / reagendada / cancelada);
 *  - esforço: contatos nossos por reunião, e contatos recebidos do cliente;
 *  - ciclo: intervalo entre reuniões e tempo para retomar contato depois delas.
 *
 * Filtros são botões (não dropdown) porque são poucos e de alternância rápida.
 */
export function AtendimentoCard({ agenda, clientes, acoes }: AtendimentoCardProps) {
  const [dias, setDias] = useState(180);
  const [monitor, setMonitor] = useState<string>('');

  const monitores = useMemo(
    () => [...new Set(clientes.map((c) => c.monitor).filter(Boolean))].sort(),
    [clientes]
  );

  // Monitor do EVENTO quando informado; senão o do cliente (eventos antigos não
  // tinham monitor próprio, e descartá-los esvaziaria o gráfico).
  const monitorPorCliente = useMemo(() => {
    const m = new Map<string, string>();
    clientes.forEach((c) => m.set(c.id, c.monitor || ''));
    return m;
  }, [clientes]);

  const filtrada = useMemo(() => {
    const agora = new Date();
    const limite = dias > 0 ? new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000) : null;
    return agenda.filter((e) => {
      if (monitor) {
        const responsavel = e.monitor || monitorPorCliente.get(e.clientId) || '';
        if (responsavel !== monitor) return false;
      }
      if (!limite) return true;
      const d = e.date ? new Date(e.date) : null;
      return d !== null && !isNaN(d.getTime()) && d >= limite;
    });
  }, [agenda, dias, monitor, monitorPorCliente]);

  // Ações registradas passam pelo mesmo filtro de período/monitor dos eventos —
  // senão o numerador cobriria um intervalo diferente do denominador.
  const acoesFiltradas = useMemo(() => {
    const agora = new Date();
    const limite = dias > 0 ? new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000) : null;
    return acoes.filter((a) => {
      if (monitor) {
        const responsavel = a.monitor || monitorPorCliente.get(a.clientId) || '';
        if (responsavel !== monitor) return false;
      }
      if (!limite) return true;
      const quando = a.dueAt || a.createdAt;
      const d = quando ? new Date(quando) : null;
      return d !== null && !isNaN(d.getTime()) && d >= limite;
    });
  }, [acoes, dias, monitor, monitorPorCliente]);

  const conf = useMemo(() => calcularConfiabilidade(filtrada), [filtrada]);
  const esforco = useMemo(() => calcularEsforcoAgenda(filtrada, acoesFiltradas), [filtrada, acoesFiltradas]);
  const ciclo = useMemo(() => calcularCicloAtendimento(filtrada), [filtrada]);

  const barras = [
    { key: 'realizadas' as const, label: 'Realizadas', valor: conf.realizadas },
    { key: 'reagendadas' as const, label: 'Reagendadas', valor: conf.reagendadas },
    { key: 'canceladas' as const, label: 'Canceladas', valor: conf.canceladas },
  ];

  return (
    <Card flat className="atendimento-card">
      <div className="section-header" style={{ flexWrap: 'wrap', gap: 10 }}>
        <h3>
          Qualidade do atendimento{' '}
          <span className="text-text-muted" style={{ fontWeight: 400, fontSize: 13 }}>
            · {conf.total} reunião(ões) com desfecho
          </span>
        </h3>
      </div>

      {/* Filtros como botões */}
      <div className="flex-row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        {PERIODOS.map((p) => (
          <button
            key={p.dias}
            className={`filtro-btn${dias === p.dias ? ' is-active' : ''}`}
            onClick={() => setDias(p.dias)}
          >
            {p.label}
          </button>
        ))}
      </div>
      {monitores.length > 0 && (
        <div className="flex-row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          <button className={`filtro-btn${monitor === '' ? ' is-active' : ''}`} onClick={() => setMonitor('')}>
            Todos os monitores
          </button>
          {monitores.map((m) => (
            <button key={m} className={`filtro-btn${monitor === m ? ' is-active' : ''}`} onClick={() => setMonitor(m)}>
              {m}
            </button>
          ))}
        </div>
      )}

      {conf.total === 0 ? (
        <div className="empty-state">Nenhuma reunião com desfecho nesse período.</div>
      ) : (
        <>
          {/* Barra empilhada do desfecho */}
          <div className="atend-barra" role="img" aria-label={`Realizadas ${conf.realizadas}, reagendadas ${conf.reagendadas}, canceladas ${conf.canceladas}`}>
            {barras.filter((b) => b.valor > 0).map((b) => (
              <div
                key={b.key}
                className="atend-barra-parte"
                style={{ width: `${(b.valor / conf.total) * 100}%`, background: CORES[b.key] }}
                title={`${b.label}: ${b.valor} (${Math.round((b.valor / conf.total) * 100)}%)`}
              />
            ))}
          </div>
          <div className="flex-row" style={{ gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
            {barras.map((b) => (
              <span key={b.key} className="inline-flex items-center gap-[6px]" style={{ fontSize: '0.76rem' }}>
                <i style={{ width: 10, height: 10, borderRadius: 3, background: CORES[b.key], display: 'inline-block' }} />
                <span className="text-text-secondary">{b.label}</span>
                <strong>{b.valor}</strong>
              </span>
            ))}
            <span style={{ fontSize: '0.76rem', marginLeft: 'auto' }} className="text-text-secondary">
              Taxa de realização <strong style={{ color: 'var(--accent)' }}>{Math.round(conf.taxaRealizacao)}%</strong>
            </span>
          </div>
        </>
      )}

      {/* Big number: esforço para conseguir uma reunião */}
      <div className="atend-big">
        <div className="atend-big-num">
          <PhoneCall size={18} className="shrink-0" />
          <strong>{esforco.acoesPorReuniao === null ? '—' : esforco.acoesPorReuniao.toFixed(1)}</strong>
        </div>
        <div className="atend-big-txt">
          <strong>ações para cada reunião</strong>
          <span className="text-text-muted">
            {esforco.totalAcoes} ação(ões) no total ÷ {esforco.acoesReuniao} do tipo Reunião
          </span>
          <span className="text-text-muted" style={{ fontSize: '0.7rem' }}>
            Reunião {esforco.porTipo.reuniao} · Contato {esforco.porTipo.contato} · Relatório {esforco.porTipo.relatorio}
            {esforco.porTipo.price > 0 ? ` · Price ${esforco.porTipo.price}` : ''}
            {esforco.porTipo.outros > 0 ? ` · outros ${esforco.porTipo.outros}` : ''}
          </span>
        </div>
      </div>

      {/* Esforço + ciclo */}
      <div className="atend-metricas">
        <div className="atend-metrica">
          <span className="atend-metrica-label"><PhoneIncoming size={13} /> Contatos recebidos do cliente</span>
          <strong className="atend-metrica-valor">{esforco.contatosDoCliente}</strong>
          <span className="atend-metrica-nota">demanda espontânea (não é esforço nosso)</span>
        </div>

        <div className="atend-metrica">
          <span className="atend-metrica-label"><CalendarSync size={13} /> Reuniões remarcadas</span>
          <strong className="atend-metrica-valor">
            {conf.total > 0 ? `${Math.round(conf.taxaRemarcacao)}%` : '—'}
          </strong>
          <span className="atend-metrica-nota">
            {conf.reunioesRemarcadas} de {conf.total} · {conf.remarcacoes} remarcação(ões) no total
          </span>
        </div>

        <div className="atend-metrica">
          <span className="atend-metrica-label">Intervalo real entre reuniões</span>
          <strong className="atend-metrica-valor">{formatarDias(ciclo.intervaloEntreReunioes)}</strong>
          <span className="atend-metrica-nota">{ciclo.amostraIntervalos} par(es) de reuniões</span>
        </div>

        <div className="atend-metrica">
          <span className="atend-metrica-label">Para retomar contato após a reunião</span>
          <strong className="atend-metrica-valor">{formatarDias(ciclo.diasParaRetomarContato)}</strong>
          <span className="atend-metrica-nota">
            {ciclo.amostraRetomadas > 0
              ? `depois, ${formatarDias(ciclo.diasDoContatoAteProximaReuniao)} até a próxima reunião`
              : 'sem contato registrado após reuniões'}
          </span>
        </div>
      </div>
    </Card>
  );
}
