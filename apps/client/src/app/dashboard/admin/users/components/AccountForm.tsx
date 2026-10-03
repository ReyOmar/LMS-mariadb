'use client';

import { FormEvent, useState } from 'react';
import { Key, Loader2, Mail, Pencil, UserPlus, X } from 'lucide-react';
import api, { errorMessage } from '@/lib/api';
import { useAlerts } from '@/contexts/AlertContext';
import { useDialog } from '@/hooks/useDialog';
import { USER_ROLE_LABEL } from '@/lib/labels';
import type { User, UserRole } from '@/types/models';
import { ROLE_OPTIONS, roleChangeProblem } from './accounts';

interface Props {
  /** Cuenta que se edita; sin ella, el formulario da de alta una nueva. */
  account?: User;
  /** Rol con el que empieza el alta: el de la pestaña abierta. */
  initialRole?: UserRole;
  /** Quien edita su propia cuenta no puede cambiarse el rol. */
  isSelf?: boolean;
  onClose: () => void;
  onSaved: (user: User) => void;
}

const FIELDS = [
  { key: 'firstName', id: 'account-first-name', label: 'Nombre', example: 'Juan' },
  { key: 'lastName', id: 'account-last-name', label: 'Apellido', example: 'Pérez' },
] as const;

const LABEL_CLASS = 'block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5';
const INPUT_CLASS =
  'w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm font-medium focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all';

/**
 * Alta y edición de una cuenta de la sede.
 *
 * En el alta, la contraseña temporal la genera el servidor y le llega a la persona por
 * correo; en el primer acceso tiene que sustituirla. En la edición el correo no se toca:
 * identifica la cuenta en la recuperación de contraseña.
 */
export function AccountForm({ account, initialRole = 'STUDENT', isSelf = false, onClose, onSaved }: Props) {
  const { showAlert, showConfirmation, notify } = useAlerts();
  const [form, setForm] = useState({
    firstName: account?.firstName ?? '',
    lastName: account?.lastName ?? '',
    email: account?.email ?? '',
    role: account?.role ?? initialRole,
  });
  const [saving, setSaving] = useState(false);
  const { dialogProps, titleId } = useDialog<HTMLFormElement>({ onClose });

  const editing = Boolean(account);
  const firstName = form.firstName.trim();
  const lastName = form.lastName.trim();
  const roleChanges = editing && form.role !== account?.role;
  const unchanged = editing && firstName === account?.firstName && lastName === account?.lastName && !roleChanges;
  // Lo que impide ofrecer algún rol, para explicarlo bajo el selector.
  const roleNotice = account
    ? ROLE_OPTIONS.map((role) => roleChangeProblem(account, role, isSelf)).find(Boolean)
    : null;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || unchanged) return;

    const email = form.email.trim();
    if (!firstName || !lastName || !email) {
      notify.warning('Todos los campos son obligatorios.');
      return;
    }

    if (account && roleChanges) {
      const confirmed = await showConfirmation(
        `¿Pasar a ${account.firstName} ${account.lastName} a ${USER_ROLE_LABEL[form.role].toLowerCase()}?`,
        'Se cerrará su sesión y tendrá que volver a entrar para ver las opciones de su nuevo rol.',
        'Cambiar rol',
        'warning',
      );
      if (!confirmed) return;
    }

    setSaving(true);
    try {
      const { data } = account
        ? await api.patch<{ message: string; user: User }>(`/auth/users/${account.guid}`, {
            firstName,
            lastName,
            ...(roleChanges ? { role: form.role } : {}),
          })
        : await api.post<{ message: string; user: User }>('/auth/users', {
            firstName,
            lastName,
            email,
            role: form.role,
          });
      notify.success(data.message);
      onSaved(data.user);
      onClose();
    } catch (error) {
      showAlert.error(account ? 'No se pudo guardar' : 'No se pudo crear la cuenta', errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const Icon = editing ? Pencil : UserPlus;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <form
        {...dialogProps}
        onSubmit={save}
        className="bg-card border border-border/50 rounded-2xl shadow-2xl w-full max-w-md max-h-[90dvh] overflow-y-auto animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-xl">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 id={titleId} className="text-lg font-bold">
                {editing ? 'Editar cuenta' : 'Nuevo usuario'}
              </h2>
              <p className="text-xs text-muted-foreground">
                {editing ? account?.email : 'Cuenta de esta sede, con acceso según su rol'}
              </p>
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
                <label htmlFor={id} className={LABEL_CLASS}>
                  {label}
                </label>
                <input
                  id={id}
                  type="text"
                  value={form[key]}
                  onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                  className={INPUT_CLASS}
                  placeholder={example}
                />
              </div>
            ))}
          </div>

          {!editing && (
            <div>
              <label htmlFor="account-email" className={LABEL_CLASS}>
                Correo electrónico
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  id="account-email"
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  className={`${INPUT_CLASS} pl-10 pr-4`}
                  placeholder="correo@ejemplo.com"
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="account-role" className={LABEL_CLASS}>
              Rol
            </label>
            <select
              id="account-role"
              value={form.role}
              onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as UserRole }))}
              className={INPUT_CLASS}
            >
              {ROLE_OPTIONS.map((role) => (
                <option
                  key={role}
                  value={role}
                  disabled={account ? roleChangeProblem(account, role, isSelf) !== null : false}
                >
                  {USER_ROLE_LABEL[role]}
                </option>
              ))}
            </select>
            {roleNotice && <p className="text-xs text-muted-foreground mt-1.5">{roleNotice}</p>}
            {roleChanges && (
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1.5">
                Cambiar el rol cierra su sesión: tendrá que volver a entrar.
              </p>
            )}
          </div>

          {!editing && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 flex items-start gap-2.5">
              <Key className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-amber-700 dark:text-amber-400">Contraseña temporal</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  La genera el sistema y le llega por correo a la persona, que deberá cambiarla la primera vez que
                  entre.
                </p>
              </div>
            </div>
          )}
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
            disabled={saving || unchanged}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-sm"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
            {editing ? 'Guardar cambios' : 'Crear cuenta'}
          </button>
        </div>
      </form>
    </div>
  );
}
