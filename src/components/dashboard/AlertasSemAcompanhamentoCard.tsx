import { useState } from 'react';
import { format } from 'date-fns';
import { Check, FileText } from 'lucide-react';
import { Badge, Button, Card, type BadgeVariant } from '../../ui';
import { Comparacao, InfoComoConta } from './Comparacao';
import type { Cliente } from '../../types';

interface AlertaCliente { cliente: Cliente; uc: Date | null | undefined; dias: number | null }

interface AlertasSemAcompanhamentoCardProps {
  /** Lista completa (não cortada): o card mostra 6 e oferece "ver todos". */
  alertas: AlertaCliente[];
  /** Total na mesma data do mês anterior. */
  totalAnterior: number;
  rotuloAnterior: string;
  followUpDays: number;
  programados: Set<string>;
  onAbrirCliente: (clienteId: string) => void;
  onProgramarRelatorio: (cliente: Cliente) => void;
}

const VISIVEIS = 6;

function severidade(dias: number | null): BadgeVariant {
  if (dias === null || dias >= 60) return 'danger';
  return 'warning';
}

/** "Atendimentos sem acompanhamento" — ninguém falou com o cliente há 30+ dias. Só conta
 * evento concluído (de qualquer tipo) ou ação concluída; cancelado e "Agendado" não. */
export function AlertasSemAcompanhamentoCard({ alertas, totalAnterior, rotuloAnterior, followUpDays, programados, onAbrirCliente, onProgramarRelatorio }: AlertasSemAcompanhamentoCardProps) {
  const [todos, setTodos] = useState(false);
  const visiveis = todos ? alertas : alertas.slice(0, VISIVEIS);
  return (
    <Card className="kpi-card">
      <div className="section-header">
        <h3>Sem acompanhamento {alertas.length > 0 && <span className="vencendo-total" style={{ marginLeft: 6 }}>{alertas.length}</span>} <InfoComoConta texto={`Atendimentos sem contato ou entrega CONCLUÍDOS há ${followUpDays}+ dias. Reunião cancelada ou ainda "Agendado" não conta.`} /></h3>
        <Comparacao atual={alertas.length} anterior={totalAnterior} subirEhBom={false} rotulo={rotuloAnterior} />
      </div>
      {alertas.length === 0 ? (
        <div className="empty-state">Tudo em dia — todo atendimento teve contato nos últimos {followUpDays} dias.</div>
      ) : (
        <>
          <div className="agenda-preview">
            {visiveis.map(({ cliente, uc, dias }) => (
              <div key={cliente.id} className="agenda-row" style={{ cursor: 'default' }}>
                <span className="agenda-row-main">
                  <button className="link-button agenda-row-title" style={{ textAlign: 'left' }} onClick={() => onAbrirCliente(cliente.id)}>
                    {cliente.empresa}
                  </button>
                  <span className="agenda-row-sub">
                    {cliente.monitor || 'sem monitor'} · {uc ? `últ. contato ${format(uc, 'dd/MM/yy')}` : 'sem registro'}
                  </span>
                </span>
                <Badge variant={severidade(dias)} style={{ flexShrink: 0 }}>
                  {dias === null ? 'Sem histórico' : `${dias} dias`}
                </Badge>
                {programados.has(cliente.id) ? (
                  <Badge variant="success" style={{ flexShrink: 0 }}><Check size={12} /> Programado</Badge>
                ) : (
                  <Button variant="secondary" style={{ flexShrink: 0, padding: '0.35rem 0.6rem', fontSize: 12 }} onClick={() => onProgramarRelatorio(cliente)} title="Programar envio de relatório">
                    <FileText size={13} /> Relatório
                  </Button>
                )}
              </div>
            ))}
          </div>
          {alertas.length > VISIVEIS && (
            <button type="button" className="gauge-toggle" onClick={() => setTodos((v) => !v)} aria-expanded={todos}>
              {todos ? 'Ver menos' : `Ver todos (${alertas.length})`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}
