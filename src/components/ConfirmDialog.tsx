import { useEffect, useRef, type ReactNode } from 'react';
import { TriangleAlert, X } from 'lucide-react';

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Parents may re-render many times a second (live data); keep the latest handler without re-running the effect.
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Focus the safe option first so Enter never triggers the destructive action by accident.
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancelRef.current();
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <button className="icon-btn modal-close" onClick={onCancel} aria-label="Close dialog">
          <X size={18} />
        </button>
        <div className={`modal-icon ${tone}`}>
          <TriangleAlert size={22} />
        </div>
        <h2 id="confirm-title">{title}</h2>
        <div className="modal-body">{children}</div>
        <div className="modal-actions">
          <button ref={cancelRef} className="btn btn-ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
