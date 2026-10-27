import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { useApp } from '../state/AppContext';

const ICONS = {
  success: CircleCheck,
  error: CircleAlert,
  info: Info,
  warning: TriangleAlert,
};

export function Toasts() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => {
        const Icon = ICONS[t.tone];
        return (
          <div key={t.id} className={`toast toast-${t.tone}`} role={t.tone === 'error' ? 'alert' : 'status'}>
            <Icon size={18} aria-hidden />
            <span>{t.message}</span>
            <button className="icon-btn" onClick={() => dismissToast(t.id)} aria-label="Dismiss notification">
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
