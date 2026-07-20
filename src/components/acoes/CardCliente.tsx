import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { CalendarPlus, Plus } from 'lucide-react';
import { rotuloData, sugestoes, type Item } from '../../utils/acoesHelpers';
import { ACAO_TIPO_LABEL, type AcaoTipo, type Cliente } from '../../types';

interface CardClienteProps {
  c: Cliente;
  comHistorico?: boolean;
  ultimoContato: Date | null;
  totalReunioes: number;
  /** Últimos itens do histórico (já limitado, ex.: 3 mais recentes). */
  historico: Item[];
  produtos: string[];
  onRegistrar: (clienteId: string, tipo?: AcaoTipo) => void;
  onAgendar: (clienteId: string) => void;
}

/** Card de cliente usado em todos os grupos de Acompanhamento (Recorrentes,
 * Sem contato, Marco, Sugestão da semana) — extraído de AcoesPage para não
 * ser redefinido a cada render e poder ser reutilizado/testado isoladamente. */
export function CardCliente({ c, comHistorico, ultimoContato, totalReunioes, historico, produtos, onRegistrar, onAgendar }: CardClienteProps) {
  const navigate = useNavigate();

  return (
    <div className="glass-card glass-card-flat acao-card">
      <div className="acao-card-head">
        <div style={{ minWidth: 0 }}>
          <button className="link-button" style={{ fontWeight: 600, fontSize: '1rem' }} onClick={() => navigate(`/clientes/${c.id}`, { state: { from: '/acoes', fromLabel: 'Ações' } })}>{c.empresa}</button>
          <div className="acao-card-badges">
            {c.atendidoMarco && <span className="badge badge-accent">Marco</span>}
            {produtos.map((p) => <span key={p} className="badge badge-muted">{p}</span>)}
          </div>
        </div>
        <span className="acao-tipo">{c.monitor || 'sem monitor'}</span>
      </div>

      <div className="acao-card-info">
        <span className="acao-dot is-ok" />
        {ultimoContato ? <>Último contato · {rotuloData(ultimoContato)}{totalReunioes ? ` · ${totalReunioes} reuniões` : ''}</> : 'Sem registro de contato'}
      </div>

      {comHistorico && (
        <div className="acao-hist">
          <span className="acao-hist-label">Últimas ações</span>
          {historico.length === 0 ? <span className="text-muted" style={{ fontSize: 12 }}>Nenhuma ação.</span> :
            historico.map((i) => (
              <div key={i.key} className="acao-hist-item">
                <span>{i.tipoLabel}</span>
                <span className="text-muted">{format(i.date, 'dd/MM/yy')}</span>
                <span className={`badge ${i.statusBadge}`}>{i.statusLabel}</span>
              </div>
            ))}
          <div className="acao-sug">
            <span className="acao-hist-label">Sugestões</span>
            {sugestoes(ultimoContato).map((t) => (
              <button key={t} className="chip-toggle" onClick={() => onRegistrar(c.id, t)}>+ {ACAO_TIPO_LABEL[t]}</button>
            ))}
          </div>
        </div>
      )}

      <div className="acao-card-actions">
        <button className="btn btn-primary" onClick={() => onRegistrar(c.id)}><Plus size={14} /> Registrar</button>
        <button className="btn btn-secondary" onClick={() => onAgendar(c.id)}><CalendarPlus size={14} /> Agendar</button>
      </div>
    </div>
  );
}
