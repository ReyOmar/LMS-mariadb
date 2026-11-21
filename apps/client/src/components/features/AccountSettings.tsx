'use client';

import { useEffect, useRef } from 'react';
import { AlertCircle, Camera, CheckCircle, Loader2, Lock, Save, Trash2, User, X } from 'lucide-react';
import { useSession, type SessionUser } from '@/contexts/SessionContext';
import { COUNTRY_INFO } from '@/lib/country';
import { PASSWORD_HINT } from '@/lib/password';
import { CountryFlag } from '@/components/ui/CountryFlag';
import { Field, NameFields, PasswordInput } from '@/components/ui/FormFields';
import { PhotoOrInitials } from '@/components/ui/UserAvatar';
import { useDialog } from '@/hooks/useDialog';
import { PHOTO_TYPES, type SettingsForm } from './account-settings/settings';
import { useAccountSettings, type Feedback } from './account-settings/useAccountSettings';

/**
 * Datos de la cuenta: nombre, foto y contraseña.
 *
 * El correo se muestra pero no se edita: identifica la cuenta en la recuperación de
 * contraseña y cambiarlo sin volver a verificarlo permitiría apropiarse de una cuenta ajena.
 *
 * El formulario se monta al abrir y se desmonta al cerrar: así siempre parte de los datos
 * actuales y las contraseñas escritas no se quedan en memoria.
 */
export function AccountSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useSession();
  if (!open || !user) return null;
  return <AccountSettingsDialog user={user} onClose={onClose} />;
}

type Update = (field: keyof SettingsForm) => (value: string) => void;

function AccountSettingsDialog({ user, onClose }: { user: SessionUser; onClose: () => void }) {
  const { dialogProps, titleId } = useDialog({ onClose });
  const settings = useAccountSettings(user, onClose);
  const { form, update, feedback } = settings;

  return (
    <div
      {...dialogProps}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div className="flex w-full max-w-lg max-h-[90vh] flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-6 py-4">
          <h2 id={titleId} className="text-lg font-bold">
            Mi cuenta
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {feedback && <FeedbackMessage feedback={feedback} />}

          <IdentitySection
            user={user}
            uploading={settings.uploadingPhoto}
            onUpload={settings.uploadPhoto}
            onDelete={settings.deletePhoto}
          />

          {/* Datos personales */}
          <section className="space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <User className="h-4 w-4 text-muted-foreground" /> Datos personales
            </h3>

            <NameFields
              idPrefix="settings"
              firstName={form.firstName}
              lastName={form.lastName}
              onFirstNameChange={update('firstName')}
              onLastNameChange={update('lastName')}
            />

            <p className="text-xs text-muted-foreground">
              El correo no se puede modificar porque identifica tu cuenta en la recuperación de contraseña. Si necesitas
              cambiarlo, pídeselo a un administrador.
            </p>
          </section>

          <PasswordSection form={form} update={update} changesPassword={settings.changesPassword} />
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-card px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border border-border px-4 text-sm font-bold hover:bg-muted transition-colors"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={settings.save}
            disabled={settings.saving}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {settings.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}

/** El resultado de la última acción. Sale arriba y se lleva a la vista: quien guarda desde el final no lo vería. */
function FeedbackMessage({ feedback }: { feedback: Feedback }) {
  const box = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    box.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [feedback]);

  return (
    <p
      ref={box}
      role={feedback.type === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-medium ${
        feedback.type === 'success'
          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          : 'border-destructive/20 bg-destructive/10 text-destructive dark:text-red-400'
      }`}
    >
      {feedback.type === 'success' ? (
        <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
      ) : (
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
      )}
      {feedback.text}
    </p>
  );
}

/** Foto, nombre, correo y sede, con los botones para cambiar o quitar la foto. */
function IdentitySection({
  user,
  uploading,
  onUpload,
  onDelete,
}: {
  user: SessionUser;
  uploading: boolean;
  onUpload: (file: File) => void;
  onDelete: () => void;
}) {
  const photoInput = useRef<HTMLInputElement>(null);

  return (
    <section className="flex items-center gap-4">
      <div className="relative">
        <div className="h-20 w-20 rounded-2xl overflow-hidden bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold">
          <PhotoOrInitials person={user} />
        </div>
        {uploading && (
          <div className="absolute inset-0 rounded-2xl bg-black/50 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-white" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-bold truncate">
          {user.firstName} {user.lastName}
        </p>
        <p className="text-sm text-muted-foreground truncate">{user.email}</p>
        <p className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1.5">
          Sede <CountryFlag country={user.country} size="sm" /> {COUNTRY_INFO[user.country].name}
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => photoInput.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:bg-muted transition-colors disabled:opacity-60"
          >
            <Camera className="h-3.5 w-3.5" /> Cambiar foto
          </button>
          {user.photoUrl && (
            <button
              type="button"
              onClick={onDelete}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-xs font-bold text-destructive dark:text-red-400 hover:bg-destructive/5 transition-colors disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" /> Quitar
            </button>
          )}
        </div>

        <input
          ref={photoInput}
          type="file"
          accept={PHOTO_TYPES.join(',')}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Se vacía para que volver a elegir el mismo archivo, ya corregido, dispare el cambio otra vez.
            event.target.value = '';
            if (file) onUpload(file);
          }}
          className="hidden"
          aria-label="Foto de perfil"
        />
      </div>
    </section>
  );
}

function PasswordSection({
  form,
  update,
  changesPassword,
}: {
  form: SettingsForm;
  update: Update;
  changesPassword: boolean;
}) {
  return (
    <section className="space-y-4">
      <h3 className="flex items-center gap-2 text-sm font-bold">
        <Lock className="h-4 w-4 text-muted-foreground" /> Cambiar contraseña
      </h3>

      <Field label="Contraseña actual" htmlFor="settings-current-password">
        <PasswordInput
          id="settings-current-password"
          value={form.currentPassword}
          onChange={(event) => update('currentPassword')(event.target.value)}
          autoComplete="current-password"
        />
      </Field>
      <Field label="Nueva contraseña" htmlFor="settings-new-password" hint={PASSWORD_HINT}>
        <PasswordInput
          id="settings-new-password"
          value={form.newPassword}
          onChange={(event) => update('newPassword')(event.target.value)}
          autoComplete="new-password"
        />
      </Field>
      <Field label="Repite la nueva contraseña" htmlFor="settings-confirm-password">
        <PasswordInput
          id="settings-confirm-password"
          value={form.confirmation}
          onChange={(event) => update('confirmation')(event.target.value)}
          autoComplete="new-password"
        />
      </Field>

      {changesPassword && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-400">
          Al cambiar la contraseña se cerrará tu sesión y tendrás que entrar de nuevo.
        </p>
      )}
    </section>
  );
}
