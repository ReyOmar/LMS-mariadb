import { passwordProblem } from '@/lib/password';

/** Imágenes admitidas para la foto de perfil. */
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** Lo que se escribe en «Mi cuenta». */
export interface SettingsForm {
  firstName: string;
  lastName: string;
  currentPassword: string;
  newPassword: string;
  confirmation: string;
}

/** Por qué no se puede guardar lo escrito, o `null` si se puede. La contraseña sólo se valida si se cambia. */
export function settingsProblem(form: SettingsForm): string | null {
  if (!form.firstName.trim() || !form.lastName.trim()) return 'El nombre y el apellido son obligatorios.';
  if (!form.newPassword) return null;
  if (!form.currentPassword) return 'Escribe tu contraseña actual para poder cambiarla.';
  const problem = passwordProblem(form.newPassword);
  if (problem) return problem;
  if (form.newPassword !== form.confirmation) return 'La nueva contraseña y su confirmación no coinciden.';
  return null;
}
