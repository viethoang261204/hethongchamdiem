import { createContext, useContext, useState, useCallback } from 'react';
import './NotifyContext.css';

const NotifyContext = createContext(null);

export function useNotify() {
  const ctx = useContext(NotifyContext);
  if (!ctx) throw new Error('useNotify must be used inside NotifyProvider');
  return ctx;
}

export function NotifyProvider({ children }) {
  const [confirmState, setConfirmState] = useState(null);
  const [toast, setToast] = useState(null);

  const showConfirm = useCallback(({ title = 'Xác nhận', message, confirmText = 'OK', cancelText = 'Hủy', danger, onConfirm, onCancel }) => {
    return new Promise((resolve) => {
      setConfirmState({
        title,
        message,
        confirmText,
        cancelText,
        danger: !!danger,
        onConfirm: () => {
          onConfirm?.();
          resolve(true);
          setConfirmState(null);
        },
        onCancel: () => {
          onCancel?.();
          resolve(false);
          setConfirmState(null);
        },
      });
    });
  }, []);

  const showAlert = useCallback((message, type = 'info') => {
    setToast({ message, type });
    const t = setTimeout(() => {
      setToast(null);
    }, 3500);
    return () => clearTimeout(t);
  }, []);

  return (
    <NotifyContext.Provider value={{ showConfirm, showAlert }}>
      {children}
      {confirmState && (
        <div className="notify-overlay" onClick={confirmState.onCancel}>
          <div className="notify-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="notify-confirm-header">
              <div className="notify-confirm-title">{confirmState.title}</div>
              <button type="button" className="notify-confirm-close" onClick={confirmState.onCancel} aria-label="Đóng">×</button>
            </div>
            <div className="notify-confirm-body">
              <p className="notify-confirm-message">{confirmState.message}</p>
            </div>
            <div className="notify-confirm-actions">
              <button type="button" className="notify-btn notify-btn-cancel" onClick={confirmState.onCancel}>
                {confirmState.cancelText}
              </button>
              <button type="button" className={`notify-btn notify-btn-confirm ${confirmState.danger ? 'danger' : ''}`} onClick={confirmState.onConfirm}>
                {confirmState.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className={`notify-toast notify-toast-${toast.type}`}>
          {toast.message}
        </div>
      )}
    </NotifyContext.Provider>
  );
}
