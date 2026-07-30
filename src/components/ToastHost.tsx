import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { dismissToast, subscribeToast, type ToastMsg } from '../utils/toast';
import { Button, Card } from '../ui';

const ICON = { success: CheckCircle2, error: AlertCircle, info: Info };

export function ToastHost() {
  const [msgs, setMsgs] = useState<ToastMsg[]>([]);

  useEffect(() => subscribeToast(setMsgs), []);

  if (msgs.length === 0) return null;

  return (
    <div className="reminder-toast-stack">
      {msgs.map((m) => {
        const Icon = ICON[m.type];
        return (
          <Card key={m.id} className={`reminder-toast toast-${m.type}`}>
            <div className="flex-between">
              <span className="flex-row">
                <Icon size={16} className={`toast-icon-${m.type}`} />
                <span style={{ fontSize: 14 }}>{m.text}</span>
              </span>
              <Button variant="secondary" size="icon" onClick={() => dismissToast(m.id)}>
                <X size={14} />
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
