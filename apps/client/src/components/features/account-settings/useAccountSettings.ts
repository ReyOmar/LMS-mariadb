'use client';

import { useState } from 'react';
import api, { errorMessage, uploadFile } from '@/lib/api';
import { useSession, type SessionUser } from '@/contexts/SessionContext';
import { useAlerts } from '@/contexts/AlertContext';
import { uploadLimit } from '@/lib/upload-limits';
import { PHOTO_TYPES, settingsProblem, type SettingsForm } from './settings';

export interface Feedback {
  type: 'success' | 'error';
  text: string;
}

/** Los datos de «Mi cuenta», su guardado y la foto de perfil, con el aviso de cada resultado. */
export function useAccountSettings(user: SessionUser, onClose: () => void) {
  const { refreshUser } = useSession();
  const { notify } = useAlerts();
  const [form, setForm] = useState<SettingsForm>({
    firstName: user.firstName,
    lastName: user.lastName,
    currentPassword: '',
    newPassword: '',
    confirmation: '',
  });
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const changesPassword = form.newPassword.length > 0;
  const update = (field: keyof SettingsForm) => (value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  const save = async () => {
    const problem = settingsProblem(form);
    if (problem) {
      setFeedback({ type: 'error', text: problem });
      return;
    }

    setSaving(true);
    try {
      await api.patch('/auth/me', {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        ...(changesPassword ? { currentPassword: form.currentPassword, newPassword: form.newPassword } : {}),
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

  /** Cambia la foto o la quita; la sesión se refresca porque es de ahí de donde la toma todo el campus. */
  const changePhoto = async (change: () => Promise<unknown>, done: string, failed: string) => {
    setUploadingPhoto(true);
    try {
      await change();
      await refreshUser();
      setFeedback({ type: 'success', text: done });
    } catch (error) {
      setFeedback({ type: 'error', text: errorMessage(error, failed) });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const uploadPhoto = (file: File) => {
    if (!PHOTO_TYPES.includes(file.type)) {
      setFeedback({ type: 'error', text: 'La foto debe ser una imagen JPG, PNG, WebP o GIF.' });
      return;
    }
    void changePhoto(
      () => uploadFile('/auth/me/photo', file, { limit: uploadLimit('avatars') }),
      'Foto de perfil actualizada.',
      'No se pudo subir la foto.',
    );
  };

  const deletePhoto = () =>
    void changePhoto(() => api.delete('/auth/me/photo'), 'Foto de perfil eliminada.', 'No se pudo eliminar la foto.');

  return { form, update, changesPassword, saving, uploadingPhoto, feedback, save, uploadPhoto, deletePhoto };
}
