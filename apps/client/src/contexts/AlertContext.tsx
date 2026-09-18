'use client';

import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect, ReactNode } from 'react';
import { AlertTriangle, CheckCircle, Info, XCircle, X } from 'lucide-react';

let toastIdCounter = 0;

type AlertType = 'success' | 'error' | 'warning' | 'info';
type ConfirmVariant = 'danger' | 'warning' | 'info';

interface AlertState {
  open: boolean;
  type: AlertType;
  title: string;
  message: string;
  autoClose: number | false; // ms to auto-close, false to disable
}

interface ConfirmState {
  open: boolean;
  title: string;
  message: string;
  confirmText: string;
  variant: ConfirmVariant;
  onConfirm: () => void;
  onCancel: () => void;
}

interface ToastItem {
  id: number;
  type: AlertType;
  title: string;
  message: string;
  duration: number; // ms
  closing: boolean;
}

interface AlertContextType {
  showAlert: {
    success: (title: string, message?: string, autoClose?: number | false) => void;
    error: (title: string, message?: string, autoClose?: number | false) => void;
    warning: (title: string, message?: string, autoClose?: number | false) => void;
    info: (title: string, message?: string, autoClose?: number | false) => void;
  };
  showToast: {
    success: (title: string, message?: string) => void;
    error: (title: string, message?: string) => void;
    warning: (title: string, message?: string) => void;
    info: (title: string, message?: string) => void;
  };
  showConfirm: (title: string, message: string, confirmText?: string, variant?: ConfirmVariant) => Promise<boolean>;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

// Default auto-close times per type (ms)
const AUTO_CLOSE_DEFAULTS: Record<AlertType, number | false> = {
  success: 3000,
  error: false, // errors stay until dismissed
  warning: 5000,
  info: 4000,
};

const TOAST_DEFAULTS: Record<AlertType, number> = {
  success: 3500,
  error: 6000,
  warning: 5000,
  info: 4000,
};

const MAX_TOASTS = 3;

export function AlertProvider({ children }: { children: ReactNode }) {
  const [alert, setAlert] = useState<AlertState>({
    open: false,
    type: 'info',
    title: '',
    message: '',
    autoClose: false,
  });
  const [confirm, setConfirm] = useState<ConfirmState>({
    open: false,
    title: '',
    message: '',
    confirmText: 'Confirmar',
    variant: 'danger',
    onConfirm: () => {},
    onCancel: () => {},
  });
  const [closing, setClosing] = useState(false);
  const autoCloseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastTimersRef = useRef<Map<number, NodeJS.Timeout>>(new Map());

  // Auto-close logic
  useEffect(() => {
    if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    if (alert.open && alert.autoClose && alert.autoClose > 0) {
      autoCloseTimerRef.current = setTimeout(() => {
        closeAlert();
      }, alert.autoClose);
    }
    return () => {
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    };
  }, [alert.open, alert.autoClose]);

  const closeAlert = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setAlert((prev) => ({ ...prev, open: false }));
      setClosing(false);
    }, 150);
  }, []);

  const displayAlert = useCallback((type: AlertType, title: string, message?: string, autoClose?: number | false) => {
    const resolvedAutoClose = autoClose !== undefined ? autoClose : AUTO_CLOSE_DEFAULTS[type];
    setClosing(false);
    setAlert({ open: true, type, title, message: message || '', autoClose: resolvedAutoClose });
  }, []);

  // El objeto se memoriza: si cambiara de identidad en cada render, cualquier efecto o
  // `useCallback` que lo tenga como dependencia se repetiría en bucle.
  const showAlertObj = useMemo(
    () => ({
      success: (title: string, message?: string, autoClose?: number | false) =>
        displayAlert('success', title, message, autoClose),
      error: (title: string, message?: string, autoClose?: number | false) =>
        displayAlert('error', title, message, autoClose),
      warning: (title: string, message?: string, autoClose?: number | false) =>
        displayAlert('warning', title, message, autoClose),
      info: (title: string, message?: string, autoClose?: number | false) =>
        displayAlert('info', title, message, autoClose),
    }),
    [displayAlert],
  );

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, closing: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 250);
    const timer = toastTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      toastTimersRef.current.delete(id);
    }
  }, []);

  const addToast = useCallback(
    (type: AlertType, title: string, message?: string) => {
      const id = ++toastIdCounter;
      const duration = TOAST_DEFAULTS[type];
      const newToast: ToastItem = { id, type, title, message: message || '', duration, closing: false };

      setToasts((prev) => {
        const updated = [...prev, newToast];
        // Remove oldest if exceeding max
        if (updated.length > MAX_TOASTS) {
          const oldest = updated[0];
          const oldTimer = toastTimersRef.current.get(oldest.id);
          if (oldTimer) {
            clearTimeout(oldTimer);
            toastTimersRef.current.delete(oldest.id);
          }
          return updated.slice(1);
        }
        return updated;
      });

      const timer = setTimeout(() => {
        dismissToast(id);
      }, duration);
      toastTimersRef.current.set(id, timer);
    },
    [dismissToast],
  );

  const showToastObj = useMemo(
    () => ({
      success: (title: string, message?: string) => addToast('success', title, message),
      error: (title: string, message?: string) => addToast('error', title, message),
      warning: (title: string, message?: string) => addToast('warning', title, message),
      info: (title: string, message?: string) => addToast('info', title, message),
    }),
    [addToast],
  );

  const showConfirm = useCallback(
    (
      title: string,
      message: string,
      confirmText = 'Confirmar',
      variant: ConfirmVariant = 'danger',
    ): Promise<boolean> => {
      return new Promise((resolve) => {
        setConfirm({
          open: true,
          title,
          message,
          confirmText,
          variant,
          onConfirm: () => {
            setConfirm((prev) => ({ ...prev, open: false }));
            resolve(true);
          },
          onCancel: () => {
            setConfirm((prev) => ({ ...prev, open: false }));
            resolve(false);
          },
        });
      });
    },
    [],
  );

  const getAlertIcon = (type: AlertType) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-8 w-8 text-emerald-500" />;
      case 'error':
        return <XCircle className="h-8 w-8 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-8 w-8 text-amber-500" />;
      case 'info':
        return <Info className="h-8 w-8 text-blue-500" />;
    }
  };

  const getAlertColorClass = (type: AlertType) => {
    switch (type) {
      case 'success':
        return 'bg-emerald-500/15 text-emerald-500';
      case 'error':
        return 'bg-red-500/15 text-red-500';
      case 'warning':
        return 'bg-amber-500/15 text-amber-500';
      case 'info':
        return 'bg-blue-500/15 text-blue-500';
    }
  };

  const getToastBorderClass = (type: AlertType) => {
    switch (type) {
      case 'success':
        return 'border-l-emerald-500';
      case 'error':
        return 'border-l-red-500';
      case 'warning':
        return 'border-l-amber-500';
      case 'info':
        return 'border-l-blue-500';
    }
  };

  const getToastProgressClass = (type: AlertType) => {
    switch (type) {
      case 'success':
        return 'bg-emerald-500';
      case 'error':
        return 'bg-red-500';
      case 'warning':
        return 'bg-amber-500';
      case 'info':
        return 'bg-blue-500';
    }
  };

  const getToastIcon = (type: AlertType) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-emerald-500" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      case 'info':
        return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  const getAlertButtonClass = (type: AlertType) => {
    switch (type) {
      case 'success':
        return 'bg-emerald-500 hover:bg-emerald-600';
      case 'error':
        return 'bg-red-500 hover:bg-red-600';
      case 'warning':
        return 'bg-amber-500 hover:bg-amber-600';
      case 'info':
        return 'bg-blue-500 hover:bg-blue-600';
    }
  };

  const getConfirmColors = (variant: ConfirmVariant) => {
    switch (variant) {
      case 'danger':
        return { bg: 'bg-red-500/15', icon: 'text-red-500', btn: 'bg-red-500 hover:bg-red-600' };
      case 'warning':
        return { bg: 'bg-amber-500/15', icon: 'text-amber-500', btn: 'bg-amber-500 hover:bg-amber-600' };
      case 'info':
        return { bg: 'bg-blue-500/15', icon: 'text-blue-500', btn: 'bg-blue-500 hover:bg-blue-600' };
    }
  };

  const confirmColors = getConfirmColors(confirm.variant);

  const valorDelContexto = useMemo(
    () => ({ showAlert: showAlertObj, showToast: showToastObj, showConfirm }),
    [showAlertObj, showToastObj, showConfirm],
  );

  return (
    <AlertContext.Provider value={valorDelContexto}>
      {children}

      {/* Alert Modal */}
      {alert.open && (
        <div
          className={`fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 transition-opacity duration-150 ${closing ? 'opacity-0' : 'opacity-100 animate-in fade-in duration-200'}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAlert();
          }}
        >
          <div
            role="alertdialog"
            aria-live="assertive"
            aria-label={alert.title}
            className={`bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transition-all duration-150 ${closing ? 'scale-95 opacity-0' : 'animate-in zoom-in-95 duration-200'}`}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={closeAlert}
              className="absolute top-3 right-3 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="p-6 flex flex-col items-center text-center">
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${getAlertColorClass(alert.type).split(' ')[0]}`}
              >
                {getAlertIcon(alert.type)}
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">{alert.title}</h3>
              {alert.message && <p className="text-muted-foreground text-sm leading-relaxed">{alert.message}</p>}
            </div>
            {/* Progress bar for auto-close */}
            {alert.autoClose && alert.autoClose > 0 && (
              <div className="px-6 -mt-2 mb-2">
                <div className="h-1 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${getAlertButtonClass(alert.type)?.split(' ')[0]}`}
                    style={{ animation: `shrink ${alert.autoClose}ms linear forwards` }}
                  />
                </div>
              </div>
            )}
            <div className="px-6 pb-6 flex justify-center">
              <button
                type="button"
                onClick={closeAlert}
                className={`w-full text-white font-bold py-3 rounded-xl transition-colors shadow-md ${getAlertButtonClass(alert.type)}`}
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {confirm.open && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) confirm.onCancel();
          }}
        >
          <div
            role="alertdialog"
            aria-live="assertive"
            aria-label={confirm.title}
            className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200"
          >
            <div className="p-6 flex flex-col items-center text-center">
              <div className={`w-16 h-16 ${confirmColors.bg} rounded-full flex items-center justify-center mb-4`}>
                <AlertTriangle className={`h-8 w-8 ${confirmColors.icon}`} />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">{confirm.title}</h3>
              {confirm.message && <p className="text-muted-foreground text-sm leading-relaxed">{confirm.message}</p>}
            </div>
            <div className="px-6 pb-6 flex items-center gap-3">
              <button
                type="button"
                onClick={confirm.onCancel}
                className="flex-1 bg-muted hover:bg-border text-foreground font-bold py-3 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirm.onConfirm}
                className={`flex-1 ${confirmColors.btn} text-white font-bold py-3 rounded-xl transition-colors shadow-md`}
              >
                {confirm.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Stack */}
      <div
        className="fixed top-4 right-4 z-[9998] flex flex-col gap-3 pointer-events-none"
        style={{ maxWidth: '420px', width: '100%' }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto bg-card border border-border/60 rounded-xl shadow-2xl overflow-hidden border-l-4 ${getToastBorderClass(toast.type)} transition-all duration-250 ${
              toast.closing ? 'opacity-0 translate-x-8 scale-95' : 'animate-in slide-in-from-right-4 duration-300'
            }`}
          >
            <div className="flex items-start gap-3 p-4">
              <div className="shrink-0 mt-0.5">{getToastIcon(toast.type)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground leading-tight">{toast.title}</p>
                {toast.message && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{toast.message}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="shrink-0 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {/* Animated progress bar */}
            <div className="h-1 bg-muted/30">
              <div
                className={`h-full rounded-r-full ${getToastProgressClass(toast.type)}`}
                style={{ animation: `toast-shrink ${toast.duration}ms linear forwards` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Animations defined in globals.css: @keyframes shrink, @keyframes toast-shrink */}
    </AlertContext.Provider>
  );
}

export function useAlert() {
  const context = useContext(AlertContext);
  if (context === undefined) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  return context;
}
