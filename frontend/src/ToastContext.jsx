import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { clsx } from 'clsx';
import { CheckCircle2, XCircle, AlertTriangle, HelpCircle, Info } from 'lucide-react';

const ToastContext = createContext(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx.showAlert;
}

export function useToastQueue() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToastQueue must be used inside ToastProvider');
  return ctx.alertQueue;
}

export function ToastProvider({ children }) {
  const [alertQueue, setAlertQueue] = useState([]);
  const alertState = alertQueue[0] ?? null;

  const showAlert = useCallback((message, type = 'info', title = '') => {
    return new Promise((resolve) => {
      const id = Date.now() + Math.random();
      const dismiss = (result) => {
        setAlertQueue(q => q.map(a => a.id === id ? { ...a, exiting: true } : a));
        setTimeout(() => {
          setAlertQueue(q => q.filter(a => a.id !== id));
          resolve(result);
        }, 200);
      };
      const entry = {
        id,
        type,
        title: title || (type === 'success' ? 'Éxito' : type === 'error' ? 'Error' : type === 'confirm' ? 'Confirmación' : 'Información'),
        message,
        onConfirm: () => dismiss(true),
        onCancel: type === 'confirm' ? () => dismiss(false) : null,
      };
      setAlertQueue(q => [...q, entry]);
    });
  }, []);

  // Auto-dismiss non-confirm alerts
  useEffect(() => {
    if (alertState && alertState.type !== 'confirm') {
      const duration = alertState.type === 'success' ? 3000 : alertState.type === 'error' ? 7000 : 5000;
      const timer = setTimeout(() => alertState.onConfirm(), duration);
      return () => clearTimeout(timer);
    }
  }, [alertState?.id]);

  return (
    <ToastContext.Provider value={{ showAlert, alertQueue }}>
      {children}
      {alertState && (
        <div
          key={alertState.id}
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          className={clsx(
            'fixed top-14 right-4 z-50 max-w-xs sm:max-w-sm w-full',
            alertState.exiting ? 'animate-slide-out-right' : 'animate-slide-in-right'
          )}
        >
          <div
            onClick={() => alertState.type !== 'confirm' && alertState.onConfirm()}
            className={clsx(
              'bg-white rounded-xl p-4 shadow-xl border border-gray-200 relative overflow-hidden transform scale-100 transition-all animate-scale-up select-none',
              alertState.type !== 'confirm' && 'cursor-pointer hover:bg-gray-50/80 active:scale-[0.99]'
            )}
          >
            <div className="flex items-start gap-3">
              <div className={clsx(
                'p-2 rounded-full flex-shrink-0',
                alertState.type === 'success' && 'bg-green-50 text-green-600',
                alertState.type === 'error'   && 'bg-red-50 text-red-600',
                alertState.type === 'warning' && 'bg-amber-50 text-amber-600',
                alertState.type === 'confirm' && 'bg-emerald-50 text-emerald-600',
                alertState.type === 'info'    && 'bg-blue-50 text-blue-600'
              )}>
                {alertState.type === 'success' && <CheckCircle2 className="w-5 h-5" />}
                {alertState.type === 'error'   && <XCircle       className="w-5 h-5" />}
                {alertState.type === 'warning' && <AlertTriangle className="w-5 h-5" />}
                {alertState.type === 'confirm' && <HelpCircle    className="w-5 h-5" />}
                {alertState.type === 'info'    && <Info          className="w-5 h-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xs font-bold text-gray-900 mb-0.5">{alertState.title}</h3>
                <p className="text-[11px] text-gray-600 whitespace-pre-line leading-relaxed">{alertState.message}</p>
              </div>
            </div>
            {alertState.type === 'confirm' && (
              <div className="mt-3 flex justify-end gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); alertState.onCancel(); }}
                  className="px-3 py-1 text-[10px] font-semibold text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); alertState.onConfirm(); }}
                  className="px-4 py-1 text-[10px] font-semibold text-white rounded-lg shadow-sm bg-[#006241] hover:bg-[#008F59] transition-colors cursor-pointer"
                >
                  Aceptar
                </button>
              </div>
            )}
            {alertState.type !== 'confirm' && (
              <div
                className={clsx(
                  'absolute bottom-0 left-0 h-[3px] animate-shrink-width-var',
                  alertState.type === 'success' && 'bg-green-600',
                  alertState.type === 'error'   && 'bg-red-600',
                  alertState.type === 'warning' && 'bg-amber-600',
                  alertState.type === 'info'    && 'bg-[#006241]'
                )}
                style={{ '--shrink-duration': alertState.type === 'success' ? '3s' : alertState.type === 'error' ? '7s' : '5s' }}
              />
            )}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}
