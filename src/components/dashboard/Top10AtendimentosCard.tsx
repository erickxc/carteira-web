import { Card } from '../../ui';
import { InfoComoConta } from './Comparacao';
import type { EsforcoAtendimento } from '../../utils/analises';

interface EsforcoCardProps {
  itens: EsforcoAtendimento[];
  /** Soma do esforço de todos os atendimentos (para a fatia do Top 10). */
  total: number;
  atendimentos: number;
  onAbrirCliente: (id: string) => void;
}

/** Contato demais para pouca reunião: 3+ contatos e mais que o dobro das reuniões. */
const muitoContato = (i: EsforcoAtendimento) => i.contato >= 3 && i.contato > 2 * i.reuniao;

/**
 * "Onde vai o esforço" — Top 10 atendimentos por interações concluídas nos
 * últimos 90 dias, com a conta aberta por tipo: serve para dimensionar a
 * carteira e achar quem pede muito contato para pouca reunião.
 */
export function Top10AtendimentosCard({ itens, total, atendimentos, onAbrirCliente }: EsforcoCardProps) {
  const max = Math.max(1, ...itens.map((i) => i.total));
  const fatia = itens.reduce((s, i) => s + i.total, 0);
  return (
    <Card className="kpi-card">
      <div className="section-header">
        <h3>Onde vai o esforço <InfoComoConta texto="Conta reuniões, contatos e precificações CONCLUÍDOS nos últimos 90 dias, por atendimento (agenda + ações registradas). Relatório de Monitoria não conta: é recorrente e dominaria o ranking; relatório de Precificação conta como precificação. Contato em amarelo = 3+ contatos e mais que o dobro das reuniões." /></h3>
        <span className="text-text-muted" style={{ fontSize: 12 }}>90 dias</span>
      </div>
      {itens.length === 0 ? (
        <div className="empty-state">Nenhuma interação concluída nos últimos 90 dias.</div>
      ) : (
        <>
          <p className="kpi-comparacao is-neutra" style={{ marginTop: 0 }}>
            Quem mais pediu trabalho nos últimos 90 dias: reuniões, contatos e precificações feitas para cada atendimento.
            Estes 10 concentram <strong className="text-text-primary">{total > 0 ? Math.round((fatia / total) * 100) : 0}%</strong> de tudo o que foi feito para os {atendimentos} atendimentos.
          </p>
          <div className="esforco-tabela" role="table" aria-label="Esforço por atendimento">
            <div className="esforco-cab" role="row">
              <span role="columnheader">Atendimento</span>
              <span role="columnheader">Reun.</span>
              <span role="columnheader">Cont.</span>
              <span role="columnheader">Prec.</span>
              <span role="columnheader">Total</span>
            </div>
            {itens.map((i) => (
              <div key={i.id} className="esforco-linha" role="row">
                <button type="button" role="cell" className="link-button esforco-nome" onClick={() => onAbrirCliente(i.id)} title={i.nome}>{i.nome}</button>
                <span role="cell">{i.reuniao || '—'}</span>
                <span role="cell" className={muitoContato(i) ? 'is-atencao' : undefined} title={muitoContato(i) ? 'Muito contato para pouca reunião' : undefined}>{i.contato || '—'}</span>
                <span role="cell">{i.precificacao || '—'}</span>
                <span role="cell" className="esforco-total">
                  <i style={{ width: `${(i.total / max) * 100}%` }} />
                  <strong>{i.total}</strong>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
