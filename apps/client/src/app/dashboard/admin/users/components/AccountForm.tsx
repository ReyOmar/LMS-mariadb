'use client';

import { Key, Loader2, Mail, Pencil, UserPlus, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useDialog } from '@/hooks/useDialog';
import { USER_ROLE_LABEL } from '@/lib/labels';
import type { User, UserRole } from '@/types/models';
import { ROLE_OPTIONS, roleChangeProblem } from './accounts';
import { FIELD_IDS, useAccountForm } from './useAccountForm';

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

const NAME_FIELDS = [
  { key: 'firstName', label: 'Nombre', example: 'Juan' },
  { key: 'lastName', label: 'Apellido', example: 'Pérez' },
] as const;

const LABEL_CLASS = 'block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5';
const INPUT_CLASS =
  'w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm font-medium focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-destructive/40';

/** El correo no se edita: identifica la cuenta al recuperar la contraseña. */
export function AccountForm({ account, initialRole = 'STUDENT', isSelf = false, onClose, onSaved }: Props) {
  const { form, editing, saving, missing, unchanged, roleChanges, roleRestriction, edit, setRole, save } =
    useAccountForm({ account, initialRole, isSelf, onClose, onSaved });
  const { dialogProps, titleId } = useDialog<HTMLFormElement>({ onClose });
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
        <FormHeader
          icon={Icon}
          titleId={titleId}
          title={editing ? 'Editar cuenta' : 'Nuevo usuario'}
          subtitle={editing ? account?.email : 'Cuenta de esta sede, con acceso según su rol'}
          onClose={onClose}
        />

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {NAME_FIELDS.map(({ key, label, example }) => (
              <NameInput
                key={key}
                id={FIELD_IDS[key]}
                label={label}
                example={example}
                value={form[key]}
                missing={missing.has(key)}
                onChange={(value) => edit(key, value)}
              />
            ))}
          </div>

          {!editing && (
            <EmailInput value={form.email} missing={missing.has('email')} onChange={(value) => edit('email', value)} />
          )}

          <RoleSelect
            account={account}
            isSelf={isSelf}
            value={form.role}
            restriction={roleRestriction}
            changes={roleChanges}
            onChange={setRole}
          />

          {!editing && <TemporaryPasswordNote />}
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

function FormHeader({
  icon: Icon,
  titleId,
  title,
  subtitle,
  onClose,
}: {
  icon: LucideIcon;
  titleId: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-6 border-b border-border/50">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-primary/10 rounded-xl">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 id={titleId} className="text-lg font-bold">
            {title}
          </h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
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
  );
}

interface InputProps {
  value: string;
  /** Se intentó guardar con el campo vacío: se marca hasta que se escribe. */
  missing: boolean;
  onChange: (value: string) => void;
}

function NameInput({
  id,
  label,
  example,
  value,
  missing,
  onChange,
}: InputProps & { id: string; label: string; example: string }) {
  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={INPUT_CLASS}
        placeholder={example}
        aria-invalid={missing}
        aria-describedby={missing ? `${id}-error` : undefined}
      />
      {missing && <RequiredNote id={`${id}-error`} />}
    </div>
  );
}

function EmailInput({ value, missing, onChange }: InputProps) {
  const id = FIELD_IDS.email;
  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>
        Correo electrónico
      </label>
      <div className="relative">
        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          id={id}
          type="email"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`${INPUT_CLASS} pl-10 pr-4`}
          placeholder="correo@ejemplo.com"
          aria-invalid={missing}
          aria-describedby={missing ? `${id}-error` : undefined}
        />
      </div>
      {missing && <RequiredNote id={`${id}-error`} />}
    </div>
  );
}

/** Los roles a los que no se puede pasar la cuenta salen desactivados, con el motivo debajo. */
function RoleSelect({
  account,
  isSelf,
  value,
  restriction,
  changes,
  onChange,
}: {
  account?: User;
  isSelf: boolean;
  value: UserRole;
  restriction: string | null | undefined;
  changes: boolean;
  onChange: (role: UserRole) => void;
}) {
  return (
    <div>
      <label htmlFor="account-role" className={LABEL_CLASS}>
        Rol
      </label>
      <select
        id="account-role"
        value={value}
        onChange={(event) => onChange(event.target.value as UserRole)}
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
      {restriction && <p className="text-xs text-muted-foreground mt-1.5">{restriction}</p>}
      {changes && (
        <p className="text-xs text-amber-800 dark:text-amber-400 mt-1.5">
          Cambiar el rol cierra su sesión: tendrá que volver a entrar.
        </p>
      )}
    </div>
  );
}

function TemporaryPasswordNote() {
  return (
    <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 flex items-start gap-2.5">
      <Key className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
      <div>
        <p className="text-xs font-bold text-amber-800 dark:text-amber-400">Contraseña temporal</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          La genera el sistema y le llega por correo a la persona, que deberá cambiarla la primera vez que entre.
        </p>
      </div>
    </div>
  );
}

/** Aviso bajo un campo obligatorio que se dejó vacío. */
function RequiredNote({ id }: { id: string }) {
  return (
    <p id={id} className="mt-1 text-xs font-medium text-destructive dark:text-red-400">
      Obligatorio.
    </p>
  );
}
