import { useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarSync, PhoneCall } from 'lucide-react';
import {
  calcularCicloAtendimento, calcularConfiabilidade, calcularEsforcoAgenda, formatarDias,
  serieRealizacaoPorMes,
} from '../../utils/metricasAtendimento';
import { LineChart } from '../LineChart';
import { dentroDaJanela, type Janela } from '../../utils/periodo';
import { Card, Chip } from '../../ui';
import { rotuloModo, type ModoContagem } from '../../utils/analises';
import type { Acao, EventoAgenda } from '../../types';

interface AtendimentoCardProps {
  /** Já filtrados pelo monitor do filtro global (`agendaPorMonitor`/`acoesPorMonitor`). */
  agenda: EventoAgenda[];
  acoes: Acao[];
  /** Mês escolhido no topo do dashboard (`janelaDoMes`): o card segue o mesmo período. */
  janela: Janela;
  agora: Date;
  /** Entregas (reunião + relatório + precificação) ou só reuniões — seletor do topo. */
  modo: ModoContagem;
}

/** Cores semânticas do desfecho — verde/amarelo/vermelho, não a paleta da marca:
 *  aqui a cor carrega o significado (deu certo / escorregou / não aconteceu). */
const CORES = {
  realizadas: 'var(--success)',
  canceladas: 'var(--danger)',
};
/** Ciclo (entre reuniões, retomar contato) usa 90 dias: no mês a amostra é de 1 a 5 casos. */
type FiltroServico = 'Todos' | 'Monitoria' | 'Price';
const FILTROS: { key: FiltroServico; label: string }[] = [
  { key: 'Todos', label: 'Geral' }, { key: 'Monitoria', label: 'Monitoria' }, { key: 'Price', label: 'Precificação' },
];
/** Evento do serviço: pelo serviço marcado; precificação avulsa é sempre Price. */
function doServico(e: EventoAgenda, f: FiltroServico): boolean {
  if (f === 'Todos') return true;
  const servicos = (e.servicos ?? []).join(' ');
  return f === 'Price' ? /prec|price/i.test(servicos) || /precific/i.test(e.type || '') : /monitor/i.test(servicos);
}
/** Ação do serviço: pelo serviço informado (ação sem serviço só entra em "Geral"). */
function acaoDoServico(a: Acao, f: FiltroServico): boolean {
  if (f === 'Todos') return true;
  const servico = a.servico || '';
  return f === 'Price' ? a.tipo === 'price' || /prec|price/i.test(servico) : /monitor/i.test(servico);
}
const DIAS_CICLO = 90;

/**
 * "Desfecho e esforço das reuniões" — três leituras de "estamos atendendo bem e com
 * que esforço?" no mês escolhido no topo:
 *  - desfecho das reuniões (realizada = concluída / cancelada; remarcação conta à parte);
 *  - esforço: ações por entrega (reunião, relatório ou precificação concluída);
 *  - ciclo (últimos 90 dias): intervalo entre reuniões e tempo para retomar contato depois delas.
 * Sem filtros próprios: o período é o do topo e o monitor é o do filtro global.
 */
export function AtendimentoCard({ agenda: agendaToda, acoes: acoesTodas, janela, agora, modo }: AtendimentoCardProps) {
  const nome = rotuloModo(modo);
  const [filtro, setFiltro] = useState<FiltroServico>('Todos');
  // O filtro de serviço vale para tudo do card: desfecho, esforço, série e ciclo.
  const agenda = useMemo(() => agendaToda.filter((e) => doServico(e, filtro)), [agendaToda, filtro]);
  const acoes = useMemo(() => acoesTodas.filter((a) => acaoDoServico(a, filtro)), [acoesTodas, filtro]);
  const filtrada = useMemo(() => agenda.filter((e) => dentroDaJanela(e.date, janela)), [agenda, janela]);
  const acoesFiltradas = useMemo(() => acoes.filter((a) => dentroDaJanela(a.dueAt || a.createdAt, janela)), [acoes, janela]);

  // Num mês FECHADO, "já aconteceu" é o fim do mês, não hoje — senão o corte
  // mudaria conforme o dia em que a tela é aberta.
  const referencia = janela.fim ?? agora;

  /** Série do gráfico: taxa de realização no histórico inteiro (recortar pelo mês deixaria um ponto só). */
  const serie = useMemo(() => {
    // Teto de 12 meses: além disso os rótulos ficam ilegíveis em meia tela.
    return serieRealizacaoPorMes(agenda, agora, modo).slice(-12).map((p) => ({
      label: format(p.mes, 'MMM', { locale: ptBR }).replace('.', ''),
      // Composição no tooltip: com poucas reuniões, uma cancelada move muito a taxa.
      full: `${format(p.mes, "MMMM 'de' yyyy", { locale: ptBR })} (${p.realizadas} de ${p.total}; ${p.canceladas} ${p.canceladas === 1 ? 'cancelada' : 'canceladas'})`,
      value: Math.round(p.taxaRealizacao),
    }));
  }, [agenda, agora, modo]);

  const conf = useMemo(() => calcularConfiabilidade(filtrada, referencia, modo), [filtrada, referencia, modo]);
  const esforco = useMemo(() => calcularEsforcoAgenda(filtrada, acoesFiltradas, referencia), [filtrada, acoesFiltradas, referencia]);
  const ciclo = useMemo(() => {
    const inicio = subDays(referencia, DIAS_CICLO);
    return calcularCicloAtendimento(agenda.filter((e) => { const d = new Date(e.date); return d >= inicio && d <= referencia; }), referencia, modo);
  }, [agenda, referencia, modo]);

  const barras = [
    { key: 'realizadas' as const, label: 'Realizadas', valor: conf.realizadas },
    { key: 'canceladas' as const, label: 'Canceladas', valor: conf.canceladas },
  ];

  return (
    <Card flat className="atendimento-card">
      <div className="section-header" style={{ flexWrap: 'wrap', gap: 4, display: 'block' }}>
        <h3 style={{ marginBottom: 2 }}>Desfecho e esforço das {nome.plural}</h3>
        <p className="atend-subtitulo" title={janela.descricao}>
          {janela.curta} · {conf.total} {conf.total === 1 ? nome.singular : nome.plural} com desfecho
        </p>
      </div>
      <div className="flex flex-wrap gap-[0.35rem] mb-2">
        {FILTROS.map((f) => <Chip key={f.key} active={filtro === f.key} onClick={() => setFiltro(f.key)}>{f.label}</Chip>)}
      </div>
      <p className="kpi-como-conta" style={{ marginBottom: 12 }}>
        Realizada = concluída. {nome.Plural} que já passou e continua &quot;Agendado&quot; fica fora até ser registrada.
      </p>

      {conf.total === 0 ? (
        <div className="empty-state">Nenhuma {nome.singular} com desfecho nesse período.</div>
      ) : (
        <>
          {/* Barra empilhada do desfecho */}
          <div className="atend-barra" role="img" aria-label={`Realizadas ${conf.realizadas}, canceladas ${conf.canceladas}`}>
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
                <i style={{ width: 6, height: 6, borderRadius: '50%', background: CORES[b.key], display: 'inline-block' }} />
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

      {/* Big number: esforço para chegar a uma entrega */}
      <div className="atend-big">
        <div className="atend-big-num">
          <PhoneCall size={18} className="shrink-0" />
          <strong>{esforco.acoesPorEntrega === null ? '—' : esforco.acoesPorEntrega.toFixed(1)}</strong>
        </div>
        <div className="atend-big-txt">
          <strong>ações por entrega</strong>
          <span
            className="text-text-muted"
            title={`Entregas: ${esforco.porTipo.reuniao} reunião(ões) + ${esforco.porTipo.relatorio} relatório(s) + ${esforco.porTipo.price} precificação(ões). `
              + `Iniciais: ${esforco.porTipo.contato} contato/ligação`
              + (esforco.porTipo.outros > 0 ? `, ${esforco.porTipo.outros} outros` : '')}
          >
            {esforco.totalAcoes} ações ÷ {esforco.acoesEntrega} entregas
          </span>
        </div>
      </div>

      {/* Tendência do indicador mês a mês: o número do topo é do mês, a linha mostra a evolução. */}
      {serie.length > 1 && (
        <div className="atend-serie">
          <span className="atend-serie-titulo">
            Evolução mensal
            <span className="text-text-muted" style={{ fontWeight: 400 }}> · taxa de realização</span>
          </span>
          <LineChart
            points={serie}
            height={150}
            largura={520}
            teto={100}
            formatValue={(v) => `${Math.round(v)}%`}
            unidade="de realização"
            titulo="Taxa de realização por mês"
            ocultarRotulos={serie.length > 6}
          />
        </div>
      )}

      <div className="atend-metricas">
        <div
          className="atend-metrica"
          title={`${conf.reunioesRemarcadas} de ${conf.total} ${nome.plural} foram remarcadas, ${conf.remarcacoes} remarcação(ões) no total`}
        >
          <span className="atend-metrica-label"><CalendarSync size={13} /> Remarcadas</span>
          <strong className="atend-metrica-valor">
            {conf.total > 0 ? `${Math.round(conf.taxaRemarcacao)}%` : '—'}
          </strong>
        </div>

        <div className="atend-metrica" title={`Média entre ${nome.plural} consecutivas do mesmo cliente, últimos ${DIAS_CICLO} dias (${ciclo.amostraIntervalos} par(es) medidos)`}>
          <span className="atend-metrica-label">Entre {nome.plural} · 90d</span>
          <strong className="atend-metrica-valor">{formatarDias(ciclo.intervaloEntreReunioes)}</strong>
        </div>

        <div
          className="atend-metrica"
          title={ciclo.amostraRetomadas > 0
            ? `Da reunião até o 1º contato nosso depois dela (${ciclo.amostraRetomadas} medições). Desse contato até a reunião seguinte: ${formatarDias(ciclo.diasDoContatoAteProximaReuniao)}`
            : 'Sem contato registrado após reuniões no período'}
        >
          <span className="atend-metrica-label">Retomar contato · 90d</span>
          <strong className="atend-metrica-valor">{formatarDias(ciclo.diasParaRetomarContato)}</strong>
        </div>
      </div>
    </Card>
  );
}
