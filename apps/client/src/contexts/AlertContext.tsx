'use client';

import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect, ReactNode } from 'react';
import { AlertTriangle, CheckCircle, Info, XCircle, X, type LucideIcon } from 'lucide-react';
import { useDialog } from '@/hooks/useDialog';

/**
 * Avisos al usuario: diálogos, mensajes pasajeros y confirmaciones.
 *
 * ## Cuál usar
 *
 * | Situación | Herramienta | Por qué |
 * |---|---|---|
 * | Algo salió bien | `notify.success` | No interrumpe: el usuario ya está en lo siguiente |
 * | No se pudo cargar la pantalla | `notify.error` | La pantalla queda vacía; el aviso explica el hueco sin bloquear |
 * | Falló algo que el usuario pidió | `showAlert.error` | Creyó que se guardó: hay que detenerlo y decírselo |
 * | Hace falta decidir antes de seguir | `showConfirmation` | Borrados y acciones que no se deshacen |
 *
 * La regla de fondo: **se bloquea sólo cuando ignorar el aviso llevaría al usuario a creer
 * algo falso**. Un listado que no carga se nota; una nota que no se guardó, no.
 *
 * Ningún fallo debe quedarse sólo en `console.error`: la consola no la mira nadie mientras
 * usa el campus.
 */

let toastCounter = 0;
let alertCounter = 0;

type AlertType = 'success' | 'error' | 'warning' | 'info';
type ConfirmationStyle = 'danger' | 'warning' | 'info';

interface AlertState {
  /** Distingue un aviso del siguiente aunque sean iguales: cada uno cuenta su propio cierre. */
  id: number;
  open: boolean;
  type: AlertType;
  title: string;
  message: string;
  /** Milisegundos hasta cerrarse solo; `false` lo desactiva. */
  autoClose: number | false;
}

interface ConfirmationState {
  open: boolean;
  title: string;
  message: string;
  confirmText: string;
  variant: ConfirmationStyle;
  onConfirm: () => void;
  onCancel: () => void;
}

interface Toast {
  id: number;
  type: AlertType;
  title: string;
  message: string;
  durationMs: number;
  closing: boolean;
}

type ShowAlert = (title: string, message?: string, autoClose?: number | false) => void;
type Notify = (title: string, message?: string) => void;

interface Alerts {
  /** Diálogo que interrumpe: se usa cuando ignorarlo dejaría al usuario creyendo algo falso. */
  showAlert: Record<AlertType, ShowAlert>;
  /** Mensaje pasajero, que no interrumpe lo que se esté haciendo. */
  notify: Record<AlertType, Notify>;
  showConfirmation: (
    title: string,
    message: string,
    confirmText?: string,
    style?: ConfirmationStyle,
  ) => Promise<boolean>;
}

const AlertsContext = createContext<Alerts | undefined>(undefined);

/** Cuánto tarda en cerrarse solo cada tipo de diálogo, en milisegundos. */
const AUTO_CLOSE_MS: Record<AlertType, number | false> = {
  success: 3000,
  error: false, // los errores se quedan hasta que alguien los cierra
  warning: 5000,
  info: 4000,
};

/** Cuánto dura a la vista cada tipo de mensaje pasajero, en milisegundos. */
const TOAST_DURATION_MS: Record<AlertType, number> = {
  success: 3500,
  error: 6000,
  warning: 5000,
  info: 4000,
};

const MAX_TOASTS = 3;

/** Icono y clases de color de cada tipo de aviso. */
const ALERT_STYLES: Record<
  AlertType,
  { icon: LucideIcon; iconColor: string; iconBackground: string; border: string; bar: string; button: string }
> = {
  success: {
    icon: CheckCircle,
    iconColor: 'text-emerald-500',
    iconBackground: 'bg-emerald-500/15',
    border: 'border-l-emerald-500',
    bar: 'bg-emerald-500',
    button: 'bg-success hover:bg-success/90 text-success-foreground',
  },
  error: {
    icon: XCircle,
    iconColor: 'text-red-500',
    iconBackground: 'bg-red-500/15',
    border: 'border-l-red-500',
    bar: 'bg-red-500',
    button: 'bg-red-600 hover:bg-red-700 text-white',
  },
  warning: {
    icon: AlertTriangle,
    iconColor: 'text-amber-500',
    iconBackground: 'bg-amber-500/15',
    border: 'border-l-amber-500',
    bar: 'bg-amber-500',
    button: 'bg-amber-500 hover:bg-amber-600 text-amber-950',
  },
  info: {
    icon: Info,
    iconColor: 'text-blue-500',
    iconBackground: 'bg-blue-500/15',
    border: 'border-l-blue-500',
    bar: 'bg-blue-500',
    button: 'bg-blue-600 hover:bg-blue-700 text-white',
  },
};

const CONFIRMATION_STYLES: Record<ConfirmationStyle, { background: string; icon: string; button: string }> = {
  danger: { background: 'bg-red-500/15', icon: 'text-red-500', button: 'bg-red-600 hover:bg-red-700 text-white' },
  warning: {
    background: 'bg-amber-500/15',
    icon: 'text-amber-500',
    button: 'bg-amber-500 hover:bg-amber-600 text-amber-950',
  },
  info: { background: 'bg-blue-500/15', icon: 'text-blue-500', button: 'bg-blue-600 hover:bg-blue-700 text-white' },
};

export function AlertProvider({ children }: { children: ReactNode }) {
  const [alert, setAlert] = useState<AlertState>({
    id: 0,
    open: false,
    type: 'info',
    title: '',
    message: '',
    autoClose: false,
  });
  const [confirmation, setConfirmation] = useState<ConfirmationState>({
    open: false,
    title: '',
    message: '',
    confirmText: 'Confirmar',
    variant: 'danger',
    onConfirm: () => {},
    onCancel: () => {},
  });
  const [closing, setClosing] = useState(false);
  /** Final del desvanecimiento del aviso que se está cerrando. */
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const closeAlert = useCallback(() => {
    setClosing(true);
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    fadeTimer.current = setTimeout(() => {
      setAlert((prev) => ({ ...prev, open: false }));
      setClosing(false);
    }, 150);
  }, []);

  // Cierre automático de los diálogos que lo piden. Cada aviso cuenta su tiempo desde que
  // aparece, aunque sustituya a otro igual que seguía abierto.
  useEffect(() => {
    if (!alert.open || !alert.autoClose) return;
    const timer = setTimeout(closeAlert, alert.autoClose);
    return () => clearTimeout(timer);
  }, [alert.id, alert.open, alert.autoClose, closeAlert]);

  const show = useCallback((type: AlertType, title: string, message?: string, autoClose?: number | false) => {
    // El aviso anterior que aún se desvanecía no puede llevarse por delante a este.
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    setClosing(false);
    setAlert({
      id: ++alertCounter,
      open: true,
      type,
      title,
      message: message || '',
      autoClose: autoClose ?? AUTO_CLOSE_MS[type],
    });
  }, []);

  // Los objetos se memorizan: si cambiaran de identidad en cada render, cualquier efecto o
  // `useCallback` que los tenga como dependencia se repetiría en bucle.
  const showAlert = useMemo<Alerts['showAlert']>(
    () => ({
      success: (title, message, autoClose) => show('success', title, message, autoClose),
      error: (title, message, autoClose) => show('error', title, message, autoClose),
      warning: (title, message, autoClose) => show('warning', title, message, autoClose),
      info: (title, message, autoClose) => show('info', title, message, autoClose),
    }),
    [show],
  );

  const closeToast = useCallback((id: number) => {
    setToasts((prev) => prev.map((toast) => (toast.id === id ? { ...toast, closing: true } : toast)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 250);
    const timer = toastTimers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      toastTimers.current.delete(id);
    }
  }, []);

  const addToast = useCallback(
    (type: AlertType, title: string, message?: string) => {
      const id = ++toastCounter;
      const durationMs = TOAST_DURATION_MS[type];
      const toast: Toast = { id, type, title, message: message || '', durationMs, closing: false };

      setToasts((prev) => {
        const updated = [...prev, toast];
        if (updated.length <= MAX_TOASTS) return updated;

        // Si se acumulan, cae el más antiguo.
        const oldest = updated[0];
        const oldestTimer = toastTimers.current.get(oldest.id);
        if (oldestTimer) {
          clearTimeout(oldestTimer);
          toastTimers.current.delete(oldest.id);
        }
        return updated.slice(1);
      });

      toastTimers.current.set(
        id,
        setTimeout(() => closeToast(id), durationMs),
      );
    },
    [closeToast],
  );

  const notify = useMemo<Alerts['notify']>(
    () => ({
      success: (title, message) => addToast('success', title, message),
      error: (title, message) => addToast('error', title, message),
      warning: (title, message) => addToast('warning', title, message),
      info: (title, message) => addToast('info', title, message),
    }),
    [addToast],
  );

  const showConfirmation = useCallback(
    (
      title: string,
      message: string,
      confirmText = 'Confirmar',
      variant: ConfirmationStyle = 'danger',
    ): Promise<boolean> => {
      return new Promise((resolve) => {
        const answer = (confirmed: boolean) => {
          setConfirmation((prev) => ({ ...prev, open: false }));
          resolve(confirmed);
        };
        setConfirmation({
          open: true,
          title,
          message,
          confirmText,
          variant,
          onConfirm: () => answer(true),
          onCancel: () => answer(false),
        });
      });
    },
    [],
  );

  const contextValue = useMemo(() => ({ showAlert, notify, showConfirmation }), [showAlert, notify, showConfirmation]);

  const alertStyle = ALERT_STYLES[alert.type];
  const AlertIcon = alertStyle.icon;
  const confirmationStyle = CONFIRMATION_STYLES[confirmation.variant];
  const autoCloseMs = typeof alert.autoClose === 'number' && alert.autoClose > 0 ? alert.autoClose : null;

  const alertDialog = useDialog({ open: alert.open, onClose: closeAlert, role: 'alertdialog' });
  const confirmationDialog = useDialog({
    open: confirmation.open,
    onClose: confirmation.onCancel,
    role: 'alertdialog',
  });
  const alertMessageId = `${alertDialog.titleId}-message`;
  const confirmationMessageId = `${confirmationDialog.titleId}-message`;

  return (
    <AlertsContext.Provider value={contextValue}>
      {children}

      {/* Ventana de aviso */}
      {alert.open && (
        <div
          className={`fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 transition-opacity duration-150 ${closing ? 'opacity-0' : 'opacity-100 animate-in fade-in duration-200'}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAlert();
          }}
        >
          <div
            {...alertDialog.dialogProps}
            aria-describedby={alert.message ? alertMessageId : undefined}
            className={`relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transition-all duration-150 ${closing ? 'scale-95 opacity-0' : 'animate-in zoom-in-95 duration-200'}`}
          >
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
                className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${alertStyle.iconBackground}`}
              >
                <AlertIcon className={`h-8 w-8 ${alertStyle.iconColor}`} />
              </div>
              <h3 id={alertDialog.titleId} className="text-xl font-bold text-foreground mb-2">
                {alert.title}
              </h3>
              {alert.message && (
                <p id={alertMessageId} className="text-muted-foreground text-sm leading-relaxed">
                  {alert.message}
                </p>
              )}
            </div>
            {/* Barra del cierre automático */}
            {autoCloseMs !== null && (
              <div className="px-6 -mt-2 mb-2">
                <div className="h-1 bg-muted rounded-full overflow-hidden">
                  <div
                    key={alert.id}
                    className={`h-full rounded-full ${alertStyle.bar}`}
                    style={{ animation: `shrink ${autoCloseMs}ms linear forwards` }}
                  />
                </div>
              </div>
            )}
            <div className="px-6 pb-6 flex justify-center">
              <button
                type="button"
                onClick={closeAlert}
                className={`w-full font-bold py-3 rounded-xl transition-colors shadow-md ${alertStyle.button}`}
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ventana de confirmación */}
      {confirmation.open && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) confirmation.onCancel();
          }}
        >
          <div
            {...confirmationDialog.dialogProps}
            aria-describedby={confirmation.message ? confirmationMessageId : undefined}
            className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200"
          >
            <div className="p-6 flex flex-col items-center text-center">
              <div
                className={`w-16 h-16 ${confirmationStyle.background} rounded-full flex items-center justify-center mb-4`}
              >
                <AlertTriangle className={`h-8 w-8 ${confirmationStyle.icon}`} />
              </div>
              <h3 id={confirmationDialog.titleId} className="text-xl font-bold text-foreground mb-2">
                {confirmation.title}
              </h3>
              {confirmation.message && (
                <p id={confirmationMessageId} className="text-muted-foreground text-sm leading-relaxed">
                  {confirmation.message}
                </p>
              )}
            </div>
            <div className="px-6 pb-6 flex items-center gap-3">
              <button
                type="button"
                onClick={confirmation.onCancel}
                className="flex-1 bg-muted hover:bg-border text-foreground font-bold py-3 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmation.onConfirm}
                className={`flex-1 ${confirmationStyle.button} font-bold py-3 rounded-xl transition-colors shadow-md`}
              >
                {confirmation.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pila de mensajes pasajeros. La animación `shrink` de las barras está en globals.css.
          Sigue activa con una ventana abierta: sus avisos tienen que leerse y poder cerrarse. */}
      <div
        data-keep-active
        className="fixed top-4 right-4 z-[9998] flex flex-col gap-3 pointer-events-none"
        style={{ maxWidth: '420px', width: '100%' }}
      >
        {toasts.map((toast) => {
          const toastStyle = ALERT_STYLES[toast.type];
          const ToastIcon = toastStyle.icon;
          return (
            <div
              key={toast.id}
              role={toast.type === 'error' ? 'alert' : 'status'}
              className={`pointer-events-auto bg-card border border-border/60 rounded-xl shadow-2xl overflow-hidden border-l-4 ${toastStyle.border} transition-all duration-250 ${
                toast.closing ? 'opacity-0 translate-x-8 scale-95' : 'animate-in slide-in-from-right-4 duration-300'
              }`}
            >
              <div className="flex items-start gap-3 p-4">
                <div className="shrink-0 mt-0.5">
                  <ToastIcon className={`h-5 w-5 ${toastStyle.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground leading-tight">{toast.title}</p>
                  {toast.message && (
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{toast.message}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => closeToast(toast.id)}
                  aria-label="Cerrar aviso"
                  className="shrink-0 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {/* Tiempo que le queda a la vista */}
              <div className="h-1 bg-muted/30">
                <div
                  className={`h-full rounded-r-full ${toastStyle.bar}`}
                  style={{ animation: `shrink ${toast.durationMs}ms linear forwards` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </AlertsContext.Provider>
  );
}

export function useAlerts(): Alerts {
  const context = useContext(AlertsContext);
  if (context === undefined) {
    throw new Error('useAlerts debe usarse dentro de AlertProvider.');
  }
  return context;
}
