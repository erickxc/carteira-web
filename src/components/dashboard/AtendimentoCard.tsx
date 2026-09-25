import { useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarSync, PhoneCall, PhoneIncoming } from 'lucide-react';
import {
  calcularCicloAtendimento, calcularConfiabilidade, calcularEsforcoAgenda, formatarDias,
  serieEsforcoPorMes,
} from '../../utils/metricasAtendimento';
import { LineChart } from '../LineChart';
import { dentroDaJanela, type Janela } from '../../utils/periodo';
import { Card } from '../../ui';
import type { Acao, EventoAgenda } from '../../types';

interface AtendimentoCardProps {
  /** Já filtrados pelo monitor do filtro global (`agendaPorMonitor`/`acoesPorMonitor`). */
  agenda: EventoAgenda[];
  acoes: Acao[];
  /** Mês escolhido no topo do dashboard (`janelaDoMes`): o card segue o mesmo período. */
  janela: Janela;
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
 * "Desfecho e esforço das reuniões" — três leituras de "estamos atendendo bem e com
 * que esforço?" no mês escolhido no topo:
 *  - desfecho das reuniões (realizada = concluída / reagendada / cancelada);
 *  - esforço: ações por entrega (reunião, relatório ou precificação concluída);
 *  - ciclo: intervalo entre reuniões e tempo para retomar contato depois delas.
 * Sem filtros próprios: o período é o do topo e o monitor é o do filtro global.
 */
export function AtendimentoCard({ agenda, acoes, janela, agora }: AtendimentoCardProps) {
  const filtrada = useMemo(() => agenda.filter((e) => dentroDaJanela(e.date, janela)), [agenda, janela]);
  const acoesFiltradas = useMemo(() => acoes.filter((a) => dentroDaJanela(a.dueAt || a.createdAt, janela)), [acoes, janela]);

  // Num mês FECHADO, "já aconteceu" é o fim do mês, não hoje — senão o corte
  // mudaria conforme o dia em que a tela é aberta.
  const referencia = janela.fim ?? agora;

  /** Série do gráfico: histórico inteiro (recortar pelo mês deixaria um ponto só). */
  const serie = useMemo(() => {
    const pontos = serieEsforcoPorMes(agenda, acoes, agora);
    // Teto de 12 meses: além disso os rótulos ficam ilegíveis em meia tela.
    return pontos.slice(-12).map((p) => ({
      label: format(p.mes, 'MMM', { locale: ptBR }).replace('.', ''),
      // Composição no tooltip: um mês com 1 entrega e 15 ações dá 15.0, e sem
      // ver o denominador o pico parece erro de cálculo em vez de amostra curta.
      full: `${format(p.mes, "MMMM 'de' yyyy", { locale: ptBR })} (${p.totalAcoes} ações ÷ ${p.acoesEntrega} ${p.acoesEntrega === 1 ? 'entrega' : 'entregas'})`,
      value: Number(p.acoesPorEntrega.toFixed(1)),
    }));
  }, [agenda, acoes, agora]);

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
        <h3 style={{ marginBottom: 2 }}>Desfecho e esforço das reuniões</h3>
        <p className="atend-subtitulo" title={janela.descricao}>
          {janela.curta} · {conf.total} {conf.total === 1 ? 'reunião' : 'reuniões'} com desfecho
        </p>
      </div>
      <p className="kpi-como-conta" style={{ marginBottom: 12 }}>
        Realizada = concluída. Reunião que já passou e continua &quot;Agendado&quot; fica fora até ser registrada.
      </p>

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
            <span className="text-text-muted" style={{ fontWeight: 400 }}> · ações por entrega</span>
          </span>
          <LineChart
            points={serie}
            height={150}
            formatValue={(v) => v.toFixed(1)}
            unidade="ações por entrega"
            titulo="Ações por entrega"
            ocultarRotulos={serie.length > 6}
          />
        </div>
      )}

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
