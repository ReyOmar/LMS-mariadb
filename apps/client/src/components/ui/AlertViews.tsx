'use client';

import { AlertTriangle, CheckCircle, Info, X, XCircle, type LucideIcon } from 'lucide-react';
import { useDialog } from '@/hooks/useDialog';

/** Lo que pinta cada aviso de `AlertContext`, que es quien decide cuándo se abre y se cierra. */

export type AlertType = 'success' | 'error' | 'warning' | 'info';
export type ConfirmationStyle = 'danger' | 'warning' | 'info';

export interface AlertState {
  /** Distingue un aviso del siguiente aunque sean iguales: cada uno cuenta su propio cierre. */
  id: number;
  open: boolean;
  type: AlertType;
  title: string;
  message: string;
  /** Milisegundos hasta cerrarse solo; `false` lo desactiva. */
  autoClose: number | false;
}

export interface ConfirmationState {
  open: boolean;
  title: string;
  message: string;
  confirmText: string;
  variant: ConfirmationStyle;
  onConfirm: () => void;
  onCancel: () => void;
}

export interface Toast {
  id: number;
  type: AlertType;
  title: string;
  message: string;
  durationMs: number;
  closing: boolean;
}

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

/** Ventana que detiene al usuario hasta que la cierra, o hasta que se cierra sola. */
export function AlertDialog({ alert, closing, onClose }: { alert: AlertState; closing: boolean; onClose: () => void }) {
  const { dialogProps, titleId } = useDialog({ open: alert.open, onClose, role: 'alertdialog' });
  if (!alert.open) return null;

  const style = ALERT_STYLES[alert.type];
  const AlertIcon = style.icon;
  const autoCloseMs = typeof alert.autoClose === 'number' && alert.autoClose > 0 ? alert.autoClose : null;
  const messageId = `${titleId}-message`;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 transition-opacity duration-150 ${closing ? 'opacity-0' : 'opacity-100 animate-in fade-in duration-200'}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        {...dialogProps}
        aria-describedby={alert.message ? messageId : undefined}
        className={`relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transition-all duration-150 ${closing ? 'scale-95 opacity-0' : 'animate-in zoom-in-95 duration-200'}`}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="p-6 flex flex-col items-center text-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${style.iconBackground}`}>
            <AlertIcon className={`h-8 w-8 ${style.iconColor}`} />
          </div>
          <h3 id={titleId} className="text-xl font-bold text-foreground mb-2">
            {alert.title}
          </h3>
          {alert.message && (
            <p id={messageId} className="text-muted-foreground text-sm leading-relaxed">
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
                className={`h-full rounded-full ${style.bar}`}
                style={{ animation: `shrink ${autoCloseMs}ms linear forwards` }}
              />
            </div>
          </div>
        )}
        <div className="px-6 pb-6 flex justify-center">
          <button
            type="button"
            onClick={onClose}
            className={`w-full font-bold py-3 rounded-xl transition-colors shadow-md ${style.button}`}
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}

/** Pregunta antes de una acción que no se deshace; Escape y el fondo equivalen a «Cancelar». */
export function ConfirmationDialog({ confirmation }: { confirmation: ConfirmationState }) {
  const { dialogProps, titleId } = useDialog({
    open: confirmation.open,
    onClose: confirmation.onCancel,
    role: 'alertdialog',
  });
  if (!confirmation.open) return null;

  const style = CONFIRMATION_STYLES[confirmation.variant];
  const messageId = `${titleId}-message`;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) confirmation.onCancel();
      }}
    >
      <div
        {...dialogProps}
        aria-describedby={confirmation.message ? messageId : undefined}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200"
      >
        <div className="p-6 flex flex-col items-center text-center">
          <div className={`w-16 h-16 ${style.background} rounded-full flex items-center justify-center mb-4`}>
            <AlertTriangle className={`h-8 w-8 ${style.icon}`} />
          </div>
          <h3 id={titleId} className="text-xl font-bold text-foreground mb-2">
            {confirmation.title}
          </h3>
          {confirmation.message && (
            <p id={messageId} className="text-muted-foreground text-sm leading-relaxed">
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
            className={`flex-1 ${style.button} font-bold py-3 rounded-xl transition-colors shadow-md`}
          >
            {confirmation.confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Pila de mensajes pasajeros. La animación `shrink` de las barras está en globals.css.
 * Sigue activa con una ventana abierta: sus avisos tienen que leerse y poder cerrarse.
 */
export function ToastStack({ toasts, onClose }: { toasts: Toast[]; onClose: (id: number) => void }) {
  return (
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
                {toast.message && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{toast.message}</p>}
              </div>
              <button
                type="button"
                onClick={() => onClose(toast.id)}
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
  );
}
