'use client';

import { FormEvent, useState } from 'react';
import { Key, Loader2, Mail, Shield, X } from 'lucide-react';
import api, { errorMessage } from '@/lib/api';
import { useAlerts } from '@/contexts/AlertContext';
import { useDialog } from '@/hooks/useDialog';

interface Props {
  /** Clave temporal de la sede; sin ella no se puede dar de alta a nadie. */
  defaultPassword: string;
  onClose: () => void;
  onCreated: () => void;
}

const FIELDS = [
  { key: 'firstName', id: 'admin-first-name', label: 'Nombre', example: 'Juan' },
  { key: 'lastName', id: 'admin-last-name', label: 'Apellido', example: 'Pérez' },
] as const;

/**
 * Alta directa de un administrador, sin pasar por la solicitud de acceso.
 *
 * La cuenta nace con la contraseña temporal de la sede y marcada para cambiarla: en el
 * primer inicio de sesión la API obliga a sustituirla antes de dejar entrar.
 */
export function CreateAdminForm({ defaultPassword, onClose, onCreated }: Props) {
  const { showAlert, notify } = useAlerts();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '' });
  const [creating, setCreating] = useState(false);
  const { dialogProps, titleId } = useDialog<HTMLFormElement>({ onClose });

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (creating) return;

    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const email = form.email.trim();

    if (!firstName || !lastName || !email) {
      notify.warning('Todos los campos son obligatorios.');
      return;
    }
    if (!defaultPassword) {
      notify.warning('No se pudo obtener la contraseña por defecto. Verifica la configuración.');
      return;
    }

    setCreating(true);
    try {
      await api.post('/auth/users', {
        firstName,
        lastName,
        email,
        role: 'ADMIN',
        temporaryPassword: defaultPassword,
      });
      notify.success(`Administrador ${firstName} ${lastName} registrado exitosamente.`);
      onCreated();
      onClose();
    } catch (error) {
      showAlert.error('No se pudo crear la cuenta', errorMessage(error));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <form
        {...dialogProps}
        onSubmit={create}
        className="bg-card border border-border/50 rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-500/10 rounded-xl">
              <Shield className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <h2 id={titleId} className="text-lg font-bold">
                Registrar administrador
              </h2>
              <p className="text-xs text-muted-foreground">Cuenta con acceso total al sistema</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-xl transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map(({ key, id, label, example }) => (
              <div key={key}>
                <label
                  htmlFor={id}
                  className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5"
                >
                  {label}
                </label>
                <input
                  id={id}
                  type="text"
                  value={form[key]}
                  onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm font-medium focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                  placeholder={example}
                />
              </div>
            ))}
          </div>

          <div>
            <label
              htmlFor="admin-email"
              className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5"
            >
              Correo electrónico
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                id="admin-email"
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-xl text-sm font-medium focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                placeholder="correo@ejemplo.com"
              />
            </div>
          </div>

          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 flex items-start gap-2.5">
            <Key className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-700 dark:text-amber-400">Contraseña por defecto del sistema</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Se usará la contraseña por defecto configurada en Solicitudes. El administrador deberá cambiarla
                obligatoriamente al ingresar por primera vez.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-border/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors rounded-xl hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={creating}
            className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 shadow-sm"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
            Registrar administrador
          </button>
        </div>
      </form>
    </div>
  );
}
