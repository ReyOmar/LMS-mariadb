'use client';

import { useRef, useState } from 'react';
import { AlertCircle, Camera, CheckCircle, Eye, EyeOff, Loader2, Lock, Save, Trash2, User, X } from 'lucide-react';
import api, { errorMessage, uploadFile, fileUrlFor } from '@/lib/api';
import { useSession, type SessionUser } from '@/contexts/SessionContext';
import { useAlerts } from '@/contexts/AlertContext';
import { COUNTRY_INFO } from '@/lib/country';
import { initials } from '@/lib/text';
import { PASSWORD_HINT, passwordProblem } from '@/lib/password';
import { uploadLimit } from '@/lib/upload-limits';
import { CountryFlag } from '@/components/ui/CountryFlag';
import { useDialog } from '@/hooks/useDialog';

/** Imágenes admitidas para la foto de perfil. */
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

interface Feedback {
  type: 'success' | 'error';
  text: string;
}

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

function AccountSettingsDialog({ user, onClose }: { user: SessionUser; onClose: () => void }) {
  const { refreshUser } = useSession();
  const { notify } = useAlerts();
  const { dialogProps, titleId } = useDialog({ onClose });

  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const photoInput = useRef<HTMLInputElement>(null);

  const changesPassword = newPassword.length > 0;

  const validate = (): string | null => {
    if (!firstName.trim() || !lastName.trim()) return 'El nombre y el apellido son obligatorios.';
    if (!changesPassword) return null;
    if (!currentPassword) return 'Escribe tu contraseña actual para poder cambiarla.';
    const problem = passwordProblem(newPassword);
    if (problem) return problem;
    if (newPassword !== confirmation) return 'La nueva contraseña y su confirmación no coinciden.';
    return null;
  };

  const save = async () => {
    const problem = validate();
    if (problem) {
      setFeedback({ type: 'error', text: problem });
      return;
    }

    setSaving(true);
    try {
      await api.patch('/auth/me', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        ...(changesPassword ? { currentPassword, newPassword } : {}),
      });

      // Cambiar la contraseña cierra la sesión: el servidor revoca el token y la siguiente
      // petición devolverá al login. La ventana se queda abierta con el aviso, porque hay
      // que leerlo: cerrarla dejaría al usuario mirando una pantalla que va a expulsarlo.
      if (changesPassword) {
        setFeedback({ type: 'success', text: 'Contraseña actualizada. Vuelve a iniciar sesión con la nueva.' });
        return;
      }

      await refreshUser();
      // Guardado sin novedad: se confirma con un aviso pasajero y la ventana se cierra.
      notify.success('Tus datos se han actualizado.');
      onClose();
    } catch (error) {
      setFeedback({ type: 'error', text: errorMessage(error, 'No se pudieron guardar los cambios.') });
    } finally {
      setSaving(false);
    }
  };

  const uploadPhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Se vacía para que volver a elegir el mismo archivo, ya corregido, dispare el cambio otra vez.
    event.target.value = '';
    if (!file) return;

    if (!IMAGE_TYPES.includes(file.type)) {
      setFeedback({ type: 'error', text: 'La foto debe ser una imagen JPG, PNG, WebP o GIF.' });
      return;
    }

    setUploadingPhoto(true);
    try {
      await uploadFile('/auth/me/photo', file, { limit: uploadLimit('avatars') });
      await refreshUser();
      setFeedback({ type: 'success', text: 'Foto de perfil actualizada.' });
    } catch (error) {
      setFeedback({ type: 'error', text: errorMessage(error, 'No se pudo subir la foto.') });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const deletePhoto = async () => {
    setUploadingPhoto(true);
    try {
      await api.delete('/auth/me/photo');
      await refreshUser();
      setFeedback({ type: 'success', text: 'Foto de perfil eliminada.' });
    } catch (error) {
      setFeedback({ type: 'error', text: errorMessage(error, 'No se pudo eliminar la foto.') });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const photo = fileUrlFor(user.photoUrl);
  const avatarInitials = initials(user.firstName, user.lastName);

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
          {feedback && (
            <p
              role={feedback.type === 'error' ? 'alert' : 'status'}
              className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-medium ${
                feedback.type === 'success'
                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  : 'border-destructive/20 bg-destructive/10 text-destructive'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              )}
              {feedback.text}
            </p>
          )}

          {/* Identidad */}
          <section className="flex items-center gap-4">
            <div className="relative">
              <div className="h-20 w-20 rounded-2xl overflow-hidden bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold">
                {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : avatarInitials}
              </div>
              {uploadingPhoto && (
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
                  disabled={uploadingPhoto}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:bg-muted transition-colors disabled:opacity-60"
                >
                  <Camera className="h-3.5 w-3.5" /> Cambiar foto
                </button>
                {user.photoUrl && (
                  <button
                    type="button"
                    onClick={deletePhoto}
                    disabled={uploadingPhoto}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/5 transition-colors disabled:opacity-60"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Quitar
                  </button>
                )}
              </div>

              <input
                ref={photoInput}
                type="file"
                accept={IMAGE_TYPES.join(',')}
                onChange={uploadPhoto}
                className="hidden"
                aria-label="Foto de perfil"
              />
            </div>
          </section>

          {/* Datos personales */}
          <section className="space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <User className="h-4 w-4 text-muted-foreground" /> Datos personales
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TextInput id="settings-first-name" label="Nombre" value={firstName} onChange={setFirstName} />
              <TextInput id="settings-last-name" label="Apellido" value={lastName} onChange={setLastName} />
            </div>

            <p className="text-xs text-muted-foreground">
              El correo no se puede modificar porque identifica tu cuenta en la recuperación de contraseña. Si necesitas
              cambiarlo, pídeselo a un administrador.
            </p>
          </section>

          {/* Contraseña */}
          <section className="space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <Lock className="h-4 w-4 text-muted-foreground" /> Cambiar contraseña
            </h3>

            <PasswordInput
              id="settings-current-password"
              label="Contraseña actual"
              value={currentPassword}
              onChange={setCurrentPassword}
              visible={showCurrent}
              onToggle={() => setShowCurrent((value) => !value)}
              autoComplete="current-password"
            />
            <PasswordInput
              id="settings-new-password"
              label="Nueva contraseña"
              value={newPassword}
              onChange={setNewPassword}
              visible={showNew}
              onToggle={() => setShowNew((value) => !value)}
              autoComplete="new-password"
              hint={PASSWORD_HINT}
            />
            <PasswordInput
              id="settings-confirm-password"
              label="Repite la nueva contraseña"
              value={confirmation}
              onChange={setConfirmation}
              visible={showNew}
              onToggle={() => setShowNew((value) => !value)}
              autoComplete="new-password"
            />

            {changesPassword && (
              <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
                Al cambiar la contraseña se cerrará tu sesión y tendrás que entrar de nuevo.
              </p>
            )}
          </section>
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
            onClick={save}
            disabled={saving}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}

function TextInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-bold text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      />
    </div>
  );
}

function PasswordInput({
  id,
  label,
  value,
  onChange,
  visible,
  onToggle,
  autoComplete,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  autoComplete: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-bold text-muted-foreground">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          className="h-11 w-full rounded-xl border border-input bg-background px-3 pr-11 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
        >
          {visible ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
        </button>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
