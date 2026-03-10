interface BadgeToastProps {
  visible: boolean;
  message: string;
  onClose: () => void;
  onViewHistory: () => void;
}

export function BadgeToast({ visible, message, onClose, onViewHistory }: BadgeToastProps) {
  return (
    <aside className={`toast ${visible ? "toast-visible" : ""}`} aria-live="polite">
      <p className="toast-message">{message}</p>
      <div className="toast-actions">
        <button onClick={onViewHistory}>通履歴を見る</button>
        <button onClick={onClose} aria-label="閉じる">
          ×
        </button>
      </div>
    </aside>
  );
}
