import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDays, addMonths, addWeeks, format, setHours, setMilliseconds, setMinutes, setSeconds, startOfDay } from 'date-fns';
import { Bell, BellOff, User, X } from 'lucide-react';
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
  // Sem isso, um lembrete disparado enquanto a permissão do navegador não está
  // concedida passa 100% despercebido: só o toast pequeno aparece, sem som
  // (autoplay bloqueado) nem notificação nativa — já foi relatado como "os
  // lembretes não estão alertando". O banner deixa esse estado visível.
  const [permissaoNotificacao, setPermissaoNotificacao] = useState<NotificationPermission | 'indisponivel'>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'indisponivel'
  );
  const semPermissao = permissaoNotificacao === 'default' || permissaoNotificacao === 'denied';

  // O banner é `position: fixed` no topo (precisa ficar visível mesmo rolando
  // a página) — sem isso, empurraria o conteúdo pra baixo sozinho. Em vez
  // disso, reserva o espaço via classe no <body>, que o CSS usa pra dar
  // padding-top no app-shell inteiro — sem essa classe, o banner ficava por
  // cima do botão "Agenda"/tema no canto superior direito.
  useEffect(() => {
    document.body.classList.toggle('has-permission-banner', semPermissao);
    return () => document.body.classList.remove('has-permission-banner');
  }, [semPermissao]);

  useEffect(() => {
    prepararSom(); // destrava o áudio na primeira interação do usuário
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(setPermissaoNotificacao);
    }
  }, []);

  function pedirPermissaoNotificacao() {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    Notification.requestPermission().then(setPermissaoNotificacao);
  }

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

  function verCliente(reminder: Lembrete) {
    if (!reminder.clientId) return;
    navigate(`/clientes/${reminder.clientId}`);
    dismiss(reminder.id);
  }

  if (queue.length === 0 && !semPermissao) return null;

  return (
    <>
      {semPermissao && (
        <div className="reminder-permission-banner">
          <BellOff size={15} />
          <span>
            {permissaoNotificacao === 'denied'
              ? <><strong>Notificações bloqueadas</strong> neste navegador — ative manualmente nas configurações do site pra não perder lembretes, ligações e reuniões.</>
              : <>Ative as <strong>notificações</strong> pra não perder lembretes, ligações e reuniões agendadas.</>}
          </span>
          {permissaoNotificacao === 'default' && (
            <Button variant="primary" onClick={pedirPermissaoNotificacao} style={{ padding: '0.3rem 0.8rem' }}>Ativar</Button>
          )}
        </div>
      )}
      {queue.length > 0 && (
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
      )}
    </>
  );
}
