import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDays, addMonths, addWeeks, format, setHours, setMilliseconds, setMinutes, setSeconds, startOfDay } from 'date-fns';
import { Bell, User, X } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { previousBusinessDay } from '../utils/holidays';
import { prepararSom, tocarSomNotificacao } from '../utils/som';
import { Badge, Button, Card } from '../ui';
import type { Lembrete, Recorrencia } from '../types';

const CHECK_INTERVAL_MS = 20_000;

function effectiveNotifyDate(originalDate: Date): Date {
  const dayOnly = previousBusinessDay(startOfDay(originalDate));
  return setMilliseconds(setSeconds(setMinutes(setHours(dayOnly, originalDate.getHours()), originalDate.getMinutes()), 0), 0);
}

function nextOccurrence(originalDate: Date, recurrence: Recorrencia): Date | null {
  switch (recurrence) {
    case 'daily':
      return addDays(originalDate, 1);
    case 'weekly':
      return addWeeks(originalDate, 1);
    case 'monthly':
      return addMonths(originalDate, 1);
    default:
      return null;
  }
}

export function ReminderPopup() {
  const { lembretes, clientes, atualizarLembrete } = useCarteira();
  const navigate = useNavigate();
  const [queue, setQueue] = useState<Lembrete[]>([]);
  const firingRef = useRef<Set<string>>(new Set());

  // Notificação nativa do navegador (Notification API) removida de propósito:
  // o app é servido em HTTP puro na rede local (não é "contexto seguro" pra
  // essa API — só HTTPS ou localhost) e o Chrome bloqueia/nega em silêncio
  // nesse caso, sem nem abrir o prompt de permissão. Alerta fica só interno:
  // toast na página + som.
  useEffect(() => {
    prepararSom(); // destrava o áudio na primeira interação do usuário
  }, []);

  useEffect(() => {
    function checkReminders() {
      const now = new Date();
      lembretes
        .filter((r) => r.status === 'ativo')
        .forEach((reminder) => {
          if (firingRef.current.has(reminder.id)) return;
          const original = new Date(reminder.datetime);
          const notifyAt = effectiveNotifyDate(original);
          if (now < notifyAt) return;

          firingRef.current.add(reminder.id);
          setQueue((prev) => [...prev, reminder]);
          tocarSomNotificacao(); // barulho ao disparar o lembrete

          const next = nextOccurrence(original, reminder.recurrence);
          const update = next ? { datetime: next.toISOString() } : { status: 'concluido' as const };
          atualizarLembrete(reminder.id, update).finally(() => firingRef.current.delete(reminder.id));
        });
    }

    checkReminders();
    const interval = setInterval(checkReminders, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [lembretes, atualizarLembrete]);

  function dismiss(id: string) {
    setQueue((prev) => prev.filter((r) => r.id !== id));
  }

  function verCliente(reminder: Lembrete) {
    if (!reminder.clientId) return;
    navigate(`/clientes/${reminder.clientId}`);
    dismiss(reminder.id);
  }

  if (queue.length === 0) return null;

  return (
    <div className="reminder-toast-stack">
      {queue.map((reminder) => {
        const clienteNome = reminder.clientId ? clientes.find((c) => c.id === reminder.clientId)?.empresa : undefined;
        return (
          <Card key={reminder.id} className="reminder-toast">
            <div className="flex-between">
              <span className="flex-row">
                <Bell size={16} style={{ color: 'var(--accent)' }} />
                <strong style={{ fontSize: 14 }}>{reminder.title}</strong>
              </span>
              <Button variant="secondary" size="icon" onClick={() => dismiss(reminder.id)}>
                <X size={14} />
              </Button>
            </div>
            {(clienteNome || reminder.type) && (
              <div className="flex-row" style={{ marginTop: 8, flexWrap: 'wrap', gap: 6 }}>
                {clienteNome && <Badge variant="accent">{clienteNome}</Badge>}
                {reminder.type && <Badge variant="muted">{reminder.type}</Badge>}
              </div>
            )}
            {reminder.description && (
              <p className="text-text-muted" style={{ fontSize: 13, marginTop: 8, marginBottom: 4 }}>
                {reminder.description}
              </p>
            )}
            <span className="text-text-muted" style={{ fontSize: 12 }}>
              {format(new Date(reminder.datetime), 'dd/MM/yyyy HH:mm')}
            </span>
            {clienteNome && (
              <Button variant="secondary" onClick={() => verCliente(reminder)} style={{ width: '100%', marginTop: 10, justifyContent: 'center' }}>
                <User size={14} /> Ver cliente
              </Button>
            )}
          </Card>
        );
      })}
    </div>
  );
}
