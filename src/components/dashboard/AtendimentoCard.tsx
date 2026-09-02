import { useCallback, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarSync, PhoneCall, PhoneIncoming } from 'lucide-react';
import {
  calcularCicloAtendimento, calcularConfiabilidade, calcularEsforcoAgenda, formatarDias,
  serieEsforcoPorMes,
} from '../../utils/metricasAtendimento';
import { LineChart } from '../LineChart';
import { dentroDaJanela, janelaDe, periodosDisponiveis, type PeriodoKey } from '../../utils/periodo';
import { Card } from '../../ui';
import type { Acao, Cliente, EventoAgenda } from '../../types';

interface AtendimentoCardProps {
  agenda: EventoAgenda[];
  clientes: Cliente[];
  acoes: Acao[];
  /** Âncora de "agora" — vem do filtro de mês/ano do Dashboard (ver
   *  `useDashboardData.dataReferencia`), não mais `new Date()` fixo: sem
   *  isso, escolher um mês passado no filtro do topo não mudava nada aqui. */
  agora: Date;
}

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
export function AtendimentoCard({ agenda, clientes, acoes, agora }: AtendimentoCardProps) {
  // Padrão = mês anterior: é o corte fechado que serve pra leitura de
  // fechamento (janela móvel de N dias não fecha com mês nenhum).
  const [periodo, setPeriodo] = useState<PeriodoKey>('mes_anterior');
  const [monitor, setMonitor] = useState<string>('');

  const janela = useMemo(() => janelaDe(periodo, agora), [periodo, agora]);

  // Só períodos que o histórico cobre: com dados de poucos meses, "Ano" seria
  // idêntico a "Tudo" e daria a impressão de que o número não muda.
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

  // Monitor(es) do EVENTO quando informado; senão o do cliente (eventos
  // antigos/sem monitor próprio não descartam o registro do gráfico).
  const combinaMonitor = useCallback(
    (monitores: string[] | undefined, clientId: string) =>
      monitores && monitores.length > 0 ? monitores.includes(monitor) : monitorPorCliente.get(clientId) === monitor,
    [monitor, monitorPorCliente]
  );

  const filtrada = useMemo(() => agenda.filter((e) => {
    if (monitor && !combinaMonitor(e.monitores, e.clientId)) return false;
    return dentroDaJanela(e.date, janela);
  }), [agenda, janela, monitor, combinaMonitor]);

  // Ações registradas passam pelo mesmo filtro de período/monitor dos eventos —
  // senão o numerador cobriria um intervalo diferente do denominador.
  const acoesFiltradas = useMemo(() => acoes.filter((a) => {
    if (monitor) {
      const responsavel = a.monitor || monitorPorCliente.get(a.clientId) || '';
      if (responsavel !== monitor) return false;
    }
    return dentroDaJanela(a.dueAt || a.createdAt, janela);
  }), [acoes, janela, monitor, monitorPorCliente]);

  // Num período FECHADO (mês anterior), a referência de "já aconteceu" é o fim
  // do intervalo, não hoje — senão eventos do fim do mês passado seriam
  // avaliados contra a data de hoje e o corte mudaria conforme o dia em que a
  // tela é aberta.
  const referencia = janela.fim ?? agora;
  /**
   * Série do gráfico: usa a agenda/ações filtradas só por MONITOR, não pelo
   * período — a tendência só faz sentido no histórico inteiro (recortar pelo
   * mês selecionado deixaria a linha com um ponto só).
   */
  const serie = useMemo(() => {
    const porMonitorEv = monitor
      ? agenda.filter((e) => combinaMonitor(e.monitores, e.clientId))
      : agenda;
    const porMonitorAc = monitor
      ? acoes.filter((a) => (a.monitor || monitorPorCliente.get(a.clientId) || '') === monitor)
      : acoes;
    const pontos = serieEsforcoPorMes(porMonitorEv, porMonitorAc, agora);
    // Teto de 12 meses: além disso os rótulos ficam ilegíveis em meia tela.
    const ultimos = pontos.slice(-12);
    return ultimos.map((p) => ({
      label: format(p.mes, 'MMM', { locale: ptBR }).replace('.', ''),
      // Composição no tooltip: um mês com 1 entrega e 15 ações dá 15.0, e sem
      // ver o denominador o pico parece erro de cálculo em vez de amostra curta.
      full: `${format(p.mes, "MMMM 'de' yyyy", { locale: ptBR })} (${p.totalAcoes} ações ÷ ${p.acoesEntrega} ${p.acoesEntrega === 1 ? 'entrega' : 'entregas'})`,
      value: Number(p.acoesPorEntrega.toFixed(1)),
    }));
  }, [agenda, acoes, monitor, monitorPorCliente, agora, combinaMonitor]);

  const conf = useMemo(() => calcularConfiabilidade(filtrada, referencia), [filtrada, referencia]);
  const esforco = useMemo(() => calcularEsforcoAgenda(filtrada, acoesFiltradas, referencia), [filtrada, acoesFiltradas, referencia]);
  const ciclo = useMemo(() => calcularCicloAtendimento(filtrada, referencia), [filtrada, referencia]);

  const barras = [
    { key: 'realizadas' as const, label: 'Realizadas', valor: conf.realizadas },
    { key: 'reagendadas' as const, label: 'Reagendadas', valor: conf.reagendadas },
    { key: 'canceladas' as const, label: 'Canceladas', valor: conf.canceladas },
  ];

  return (
    <Card flat className="atendimento-card">
      <div className="section-header" style={{ flexWrap: 'wrap', gap: 4, display: 'block' }}>
        <h3 style={{ marginBottom: 2 }}>Tendência de Contato Assertivo</h3>
        {/* Curta no texto, completa no title: em meia tela a faixa de datas não
            cabe, e o nome do mês já identifica o período. */}
        <p className="atend-subtitulo" title={janela.descricao}>
          {janela.curta} · {conf.total} {conf.total === 1 ? 'reunião' : 'reuniões'}
          {monitor ? ` · ${monitor}` : ''}
        </p>
      </div>

      {/* Filtros como botões */}
      <div className="flex-row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
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

      {/* Big number: esforço para chegar a uma entrega (reunião ou relatório) */}
      <div className="atend-big">
        <div className="atend-big-num">
          <PhoneCall size={18} className="shrink-0" />
          <strong>{esforco.acoesPorEntrega === null ? '—' : esforco.acoesPorEntrega.toFixed(1)}</strong>
        </div>
        <div className="atend-big-txt">
          <strong>ações por reunião/relatório</strong>
          {/* Uma linha só; a composição detalhada vai no title (antes eram três
              linhas, que não caberiam em meia tela). */}
          <span
            className="text-text-muted"
            title={`Entregas: ${esforco.porTipo.reuniao} reunião(ões) + ${esforco.porTipo.relatorio} relatório(s). `
              + `Iniciais: ${esforco.porTipo.contato} contato/ligação`
              + (esforco.porTipo.price > 0 ? `, ${esforco.porTipo.price} price` : '')
              + (esforco.porTipo.outros > 0 ? `, ${esforco.porTipo.outros} outros` : '')}
          >
            {esforco.totalAcoes} ações ÷ {esforco.acoesEntrega} entregas
          </span>
        </div>
      </div>

      {/* Tendência do indicador mês a mês — é o que dá sentido ao nome do card:
          o número do topo é do período filtrado, a linha mostra a evolução. */}
      {serie.length > 1 && (
        <div className="atend-serie">
          <span className="atend-serie-titulo">
            Evolução mensal
            <span className="text-text-muted" style={{ fontWeight: 400 }}>
              {' '}· ações por entrega{monitor ? ` · ${monitor}` : ''}
            </span>
          </span>
          <LineChart
            points={serie}
            height={150}
            formatValue={(v) => v.toFixed(1)}
            unidade="ações por entrega"
            ocultarRotulos={serie.length > 6}
          />
        </div>
      )}

      {/* Esforço + ciclo. Rótulos curtos e o detalhe (amostra, composição) no
          title: em meia tela as notas de duas linhas dominavam o card. */}
      <div className="atend-metricas">
        <div className="atend-metrica" title="Contatos registrados como iniciativa do cliente — demanda espontânea, não é esforço nosso">
          <span className="atend-metrica-label"><PhoneIncoming size={13} /> Cliente procurou</span>
          <strong className="atend-metrica-valor">{esforco.contatosDoCliente}</strong>
        </div>

        <div
          className="atend-metrica"
          title={`${conf.reunioesRemarcadas} de ${conf.total} reuniões foram remarcadas, ${conf.remarcacoes} remarcação(ões) no total`}
        >
          <span className="atend-metrica-label"><CalendarSync size={13} /> Remarcadas</span>
          <strong className="atend-metrica-valor">
            {conf.total > 0 ? `${Math.round(conf.taxaRemarcacao)}%` : '—'}
          </strong>
        </div>

        <div className="atend-metrica" title={`Média entre reuniões consecutivas do mesmo cliente (${ciclo.amostraIntervalos} par(es) medidos)`}>
          <span className="atend-metrica-label">Entre reuniões</span>
          <strong className="atend-metrica-valor">{formatarDias(ciclo.intervaloEntreReunioes)}</strong>
        </div>

        <div
          className="atend-metrica"
          title={ciclo.amostraRetomadas > 0
            ? `Da reunião até o 1º contato nosso depois dela (${ciclo.amostraRetomadas} medições). Desse contato até a reunião seguinte: ${formatarDias(ciclo.diasDoContatoAteProximaReuniao)}`
            : 'Sem contato registrado após reuniões no período'}
        >
          <span className="atend-metrica-label">Retomar contato</span>
          <strong className="atend-metrica-valor">{formatarDias(ciclo.diasParaRetomarContato)}</strong>
        </div>
      </div>
    </Card>
  );
}
