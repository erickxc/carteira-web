import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarPlus, ChevronDown, ChevronUp, Lightbulb, User } from 'lucide-react';
import { useCarteira } from '../../context/CarteiraContext';
import { sugerirAgenda } from '../../utils/sugestaoAgenda';
import { Badge, Button, Card } from '../../ui';

interface SugestaoAgendaCardProps {
  /** Abre o formulário de evento já com cliente/data/hora da sugestão. */
  onAgendar: (clienteId: string, dia: Date, hora: string) => void;
}

/**
 * Sugestão de encaixes para a semana. É SÓ SUGESTÃO: nada aqui grava nada —
 * cada linha tem um botão que abre o formulário normal pré-preenchido, e o
 * usuário decide. Recolhido por padrão para não competir com o calendário.
 */
export function SugestaoAgendaCard({ onAgendar }: SugestaoAgendaCardProps) {
  const { clientes, agenda, acoes, cadencias } = useCarteira();
  const [aberto, setAberto] = useState(false);

  const sugestoes = useMemo(
    () => sugerirAgenda(clientes, agenda, acoes, cadencias),
    [clientes, agenda, acoes, cadencias]
  );

  if (sugestoes.length === 0) return null;

  return (
    <Card flat className="agenda-noprint" style={{ marginBottom: 16 }}>
      <div className="flex-between" style={{ gap: 10, flexWrap: 'wrap' }}>
        <div className="flex-row" style={{ gap: 8, alignItems: 'center' }}>
          <Lightbulb size={16} className="text-[color:var(--accent)] shrink-0" />
          <strong style={{ fontSize: '0.95rem' }}>Sugestões de encaixe</strong>
          <Badge variant="accent">{sugestoes.length}</Badge>
          <span className="text-text-muted" style={{ fontSize: 12 }}>
            clientes com cadência atrasada e sem reunião marcada
          </span>
        </div>
        <Button variant="secondary" onClick={() => setAberto((v) => !v)}>
          {aberto ? <><ChevronUp size={15} /> Recolher</> : <><ChevronDown size={15} /> Ver sugestões</>}
        </Button>
      </div>

      {aberto && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          {sugestoes.map((s) => (
            <div
              key={`${s.cliente.id}-${format(s.dia, 'yyyy-MM-dd')}-${s.hora}`}
              className="flex-between"
              style={{ gap: 12, flexWrap: 'wrap', padding: '10px 12px', background: 'var(--card-hover)', borderRadius: 6 }}
            >
              <div style={{ minWidth: 0 }}>
                <strong style={{ fontSize: 14 }}>{s.cliente.empresa}</strong>
                <div className="flex-row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  <Badge variant="warning" style={{ fontSize: 10 }}>{s.motivo}</Badge>
                  <Badge variant="muted" style={{ fontSize: 10 }}>{s.servico}</Badge>
                  {s.monitor && (
                    <span className="text-text-muted" style={{ fontSize: 12 }}>
                      <User size={10} /> {s.monitor}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex-row" style={{ gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 13 }} className="text-text-secondary">
                  {format(s.dia, "EEE, dd/MM", { locale: ptBR })} · {s.hora}
                </span>
                <Button variant="primary" onClick={() => onAgendar(s.cliente.id, s.dia, s.hora)}>
                  <CalendarPlus size={14} /> Agendar
                </Button>
              </div>
            </div>
          ))}
          <span className="text-text-muted" style={{ fontSize: 12 }}>
            Horários propostos só em dias úteis, evitando conflito com o próprio monitor · nada é agendado sem você confirmar.
          </span>
        </div>
      )}
    </Card>
  );
}
