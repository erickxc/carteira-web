import { useEffect, useRef, useState } from 'react';
import { addDays, addMonths, addWeeks, format, setHours, setMilliseconds, setMinutes, setSeconds, startOfDay } from 'date-fns';
import { Bell, X } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { previousBusinessDay } from '../utils/holidays';
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
  const { lembretes, atualizarLembrete } = useCarteira();
  const [queue, setQueue] = useState<Lembrete[]>([]);
  const firingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
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

          if ('Notification' in window && Notification.permission === 'granted') {
            const notif = new Notification(reminder.title, {
              body: reminder.description || 'Lembrete da Carteira — 2D Consultores',
              icon: '/favicon.svg',
              tag: reminder.id,
              requireInteraction: true,
            });
            notif.onclick = () => { window.focus(); notif.close(); };
          }

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

  if (queue.length === 0) return null;

  return (
    <div className="reminder-toast-stack">
      {queue.map((reminder) => (
        <div key={reminder.id} className="glass-card reminder-toast">
          <div className="flex-between">
            <span className="flex-row">
              <Bell size={16} style={{ color: 'var(--accent)' }} />
              <strong style={{ fontSize: 14 }}>{reminder.title}</strong>
            </span>
            <button className="btn btn-secondary btn-icon" onClick={() => dismiss(reminder.id)}>
              <X size={14} />
            </button>
          </div>
          {reminder.description && (
            <p className="text-muted" style={{ fontSize: 13, marginTop: 8, marginBottom: 4 }}>
              {reminder.description}
            </p>
          )}
          <span className="text-muted" style={{ fontSize: 12 }}>
            {format(new Date(reminder.datetime), 'dd/MM/yyyy HH:mm')}
          </span>
        </div>
      ))}
    </div>
  );
}
