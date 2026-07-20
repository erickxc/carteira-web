import { format } from 'date-fns';
import { Check, FileText } from 'lucide-react';
import type { Cliente } from '../../types';

interface AlertaCliente { cliente: Cliente; uc: Date | null | undefined; dias: number | null }

interface AlertasSemAcompanhamentoCardProps {
  alertas: AlertaCliente[];
  followUpDays: number;
  programados: Set<string>;
  onAbrirCliente: (clienteId: string) => void;
  onProgramarRelatorio: (cliente: Cliente) => void;
}

function severidade(dias: number | null): string {
  if (dias === null || dias >= 60) return 'badge-danger';
  return 'badge-warning';
}

/** "Clientes sem Acompanhamento" — alertas de clientes ativos parados há muito tempo. */
export function AlertasSemAcompanhamentoCard({ alertas, followUpDays, programados, onAbrirCliente, onProgramarRelatorio }: AlertasSemAcompanhamentoCardProps) {
  return (
    <div className="glass-card">
      <div className="section-header">
        <h3>Clientes sem Acompanhamento</h3>
        <span className="text-muted" style={{ fontSize: 12 }}>{followUpDays}+ dias sem contato</span>
      </div>
      {alertas.length === 0 ? (
        <div className="empty-state">Nenhum alerta — carteira em dia.</div>
      ) : (
        <div className="agenda-preview">
          {alertas.map(({ cliente, uc, dias }) => (
            <div key={cliente.id} className="agenda-row" style={{ cursor: 'default' }}>
              <span className="agenda-row-main">
                <button className="link-button agenda-row-title" style={{ textAlign: 'left' }} onClick={() => onAbrirCliente(cliente.id)}>
                  {cliente.empresa}
                </button>
                <span className="agenda-row-sub">
                  {cliente.monitor || 'sem monitor'} · {uc ? `últ. contato ${format(uc, 'dd/MM/yy')}` : 'sem registro'}
                </span>
              </span>
              <span className={`badge ${severidade(dias)}`} style={{ flexShrink: 0 }}>
                {dias === null ? 'Sem histórico' : `${dias} dias`}
              </span>
              {programados.has(cliente.id) ? (
                <span className="badge badge-success" style={{ flexShrink: 0 }}><Check size={12} /> Programado</span>
              ) : (
                <button className="btn btn-secondary" style={{ flexShrink: 0, padding: '0.35rem 0.6rem', fontSize: 12 }} onClick={() => onProgramarRelatorio(cliente)} title="Programar envio de relatório">
                  <FileText size={13} /> Relatório
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
