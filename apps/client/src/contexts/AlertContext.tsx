'use client';

import { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect, ReactNode } from 'react';
import {
  AlertDialog,
  ConfirmationDialog,
  ToastStack,
  type AlertState,
  type AlertType,
  type ConfirmationState,
  type ConfirmationStyle,
  type Toast,
} from '@/components/ui/AlertViews';

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

  return (
    <AlertsContext.Provider value={contextValue}>
      {children}
      <AlertDialog alert={alert} closing={closing} onClose={closeAlert} />
      <ConfirmationDialog confirmation={confirmation} />
      <ToastStack toasts={toasts} onClose={closeToast} />
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
