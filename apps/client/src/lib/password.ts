/**
 * Política de contraseñas — espejo de `apps/api/src/common/domain/password.ts`.
 *
 * El servidor es quien decide; esto sólo evita el viaje de ida y vuelta y hace que todas
 * las pantallas pidan lo mismo, con el mismo mensaje que daría el servidor.
 */

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

/** Un símbolo es cualquier carácter que no sea letra, cifra ni espacio: `!`, `#`, `$`, `%`, `¿`… */
const SYMBOL = /[^\p{L}\p{N}\s]/u;

/** Texto de ayuda que acompaña a cualquier campo de contraseña nueva. */
export const PASSWORD_HINT = `Mínimo ${MIN_PASSWORD_LENGTH} caracteres, con al menos una letra, un número y un símbolo (como ! # $ %).`;

/** Lo que le falta a una contraseña para ser válida, o `null` si cumple. */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `La contraseña no puede superar los ${MAX_PASSWORD_LENGTH} caracteres.`;
  }
  if (!/\p{L}/u.test(password)) return 'La contraseña debe incluir al menos una letra.';
  if (!/[0-9]/.test(password)) return 'La contraseña debe incluir al menos un número.';
  if (!SYMBOL.test(password)) return 'La contraseña debe incluir al menos un símbolo, como ! # $ % o &.';
  return null;
}
