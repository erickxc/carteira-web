import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { dismissToast, subscribeToast, type ToastMsg } from '../utils/toast';

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
          <div key={m.id} className={`glass-card reminder-toast toast-${m.type}`}>
            <div className="flex-between">
              <span className="flex-row">
                <Icon size={16} className={`toast-icon-${m.type}`} />
                <span style={{ fontSize: 14 }}>{m.text}</span>
              </span>
              <button className="btn btn-secondary btn-icon" onClick={() => dismissToast(m.id)}>
                <X size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
