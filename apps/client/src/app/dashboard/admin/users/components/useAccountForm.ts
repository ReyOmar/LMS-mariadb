'use client';

import { FormEvent, useState } from 'react';
import api, { errorMessage } from '@/lib/api';
import { useAlerts } from '@/contexts/AlertContext';
import { USER_ROLE_LABEL } from '@/lib/labels';
import type { User, UserRole } from '@/types/models';
import { ROLE_OPTIONS, missingAccountFields, roleChangeProblem, type AccountField } from './accounts';

/** Dónde está cada campo obligatorio, para llevar el foco al primero que falte. */
export const FIELD_IDS: Record<AccountField, string> = {
  firstName: 'account-first-name',
  lastName: 'account-last-name',
  email: 'account-email',
};

interface Options {
  /** Cuenta que se edita; sin ella, el formulario da de alta una nueva. */
  account?: User;
  initialRole: UserRole;
  isSelf: boolean;
  onClose: () => void;
  onSaved: (user: User) => void;
}

/** El alta o la edición de una cuenta: lo escrito, lo que falta y el guardado con sus avisos. */
export function useAccountForm({ account, initialRole, isSelf, onClose, onSaved }: Options) {
  const { showAlert, showConfirmation, notify } = useAlerts();
  const [form, setForm] = useState({
    firstName: account?.firstName ?? '',
    lastName: account?.lastName ?? '',
    email: account?.email ?? '',
    role: account?.role ?? initialRole,
  });
  const [saving, setSaving] = useState(false);
  // Campos obligatorios que estaban vacíos al intentar guardar: se marcan hasta que se escriben.
  const [missing, setMissing] = useState<ReadonlySet<AccountField>>(new Set());

  const editing = Boolean(account);
  const firstName = form.firstName.trim();
  const lastName = form.lastName.trim();
  const roleChanges = editing && form.role !== account?.role;
  const unchanged = editing && firstName === account?.firstName && lastName === account?.lastName && !roleChanges;
  const roleRestriction = account
    ? ROLE_OPTIONS.map((role) => roleChangeProblem(account, role, isSelf)).find(Boolean)
    : null;

  const edit = (key: AccountField, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (missing.has(key)) setMissing((current) => new Set([...current].filter((field) => field !== key)));
  };
  const setRole = (role: UserRole) => setForm((current) => ({ ...current, role }));

  /** Cambiar el rol cierra la sesión de la persona: se confirma antes. */
  const confirmRoleChange = (current: User) =>
    showConfirmation(
      `¿Pasar a ${current.firstName} ${current.lastName} a ${USER_ROLE_LABEL[form.role].toLowerCase()}?`,
      'Se cerrará su sesión y tendrá que volver a entrar para ver las opciones de su nuevo rol.',
      'Cambiar rol',
      'warning',
    );

  const persist = () =>
    account
      ? api.patch<{ message: string; user: User }>(`/auth/users/${encodeURIComponent(account.guid)}`, {
          firstName,
          lastName,
          ...(roleChanges ? { role: form.role } : {}),
        })
      : api.post<{ message: string; user: User }>('/auth/users', {
          firstName,
          lastName,
          email: form.email.trim(),
          role: form.role,
        });

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || unchanged) return;

    const empty = missingAccountFields(form, !editing);
    if (empty.length > 0) {
      setMissing(new Set(empty));
      document.getElementById(FIELD_IDS[empty[0]])?.focus();
      notify.warning('Completa los campos marcados.');
      return;
    }
    if (account && roleChanges && !(await confirmRoleChange(account))) return;

    setSaving(true);
    try {
      const { data } = await persist();
      notify.success(data.message);
      onSaved(data.user);
      onClose();
    } catch (error) {
      showAlert.error(account ? 'No se pudo guardar' : 'No se pudo crear la cuenta', errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return { form, editing, saving, missing, unchanged, roleChanges, roleRestriction, edit, setRole, save };
}
