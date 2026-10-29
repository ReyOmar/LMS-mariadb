import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';

/**
 * Política de contraseñas — fuente única de verdad: una sola regla y un solo mensaje, se
 * entre por el alta, el primer acceso, la recuperación o el perfil. El cliente la repite para
 * avisar antes de enviar (ver `client-mirrors.spec.ts`).
 */

const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

/** Un símbolo es cualquier carácter que no sea letra, cifra ni espacio: `!`, `#`, `$`, `%`, `¿`… */
const SYMBOL = /[^\p{L}\p{N}\s]/u;

/** Coste de bcrypt. 10 rondas es el equilibrio habitual entre seguridad y latencia. */
const BCRYPT_ROUNDS = 10;

/** Lo que le falta a una contraseña para cumplir la política, dicho para el usuario; `null` si la cumple. */
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

/**
 * Valida la robustez de una contraseña nueva.
 * @throws BadRequestException con lo que le falta, para que la interfaz lo muestre tal cual.
 */
export function validateStrength(password: string): void {
  const problem = passwordProblem(password);
  if (problem) throw new BadRequestException(problem);
}

/** Letras y dígitos sin los que se confunden al copiarlos a mano (0/O, 1/l/I), y símbolos fáciles de teclear. */
const TEMPORARY_LETTERS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const TEMPORARY_DIGITS = '23456789';
const TEMPORARY_SYMBOLS = '!#$%&*+?@';
const TEMPORARY_LENGTH = 12;

/**
 * Contraseña temporal aleatoria para una cuenta nueva. Cumple la política (lleva letras,
 * números y un símbolo) y es distinta en cada cuenta: conocer la de una no da acceso a
 * ninguna otra.
 */
export function generateTemporaryPassword(): string {
  const alphabet = TEMPORARY_LETTERS + TEMPORARY_DIGITS;
  const chars = Array.from({ length: TEMPORARY_LENGTH - 3 }, () => alphabet[randomInt(alphabet.length)]);
  chars.push(
    TEMPORARY_LETTERS[randomInt(TEMPORARY_LETTERS.length)],
    TEMPORARY_DIGITS[randomInt(TEMPORARY_DIGITS.length)],
    TEMPORARY_SYMBOLS[randomInt(TEMPORARY_SYMBOLS.length)],
  );
  // Barajado de Fisher-Yates para que la letra, el número y el símbolo garantizados no queden al final.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/** Cifra una contraseña ya validada. */
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Compara una contraseña en claro con su hash.
 * Si la cuenta no tiene hash devuelve `false` en vez de lanzar: una cuenta sin contraseña
 * simplemente no puede autenticarse por esta vía.
 */
export function passwordMatches(password: string, hash: string | null): Promise<boolean> {
  if (!hash) return Promise.resolve(false);
  return bcrypt.compare(password, hash);
}

/**
 * Hash de un valor que no corresponde a ninguna cuenta, calculado una sola vez al cargar
 * el módulo. Sirve de referencia para {@link simulatePasswordCheck}.
 */
const DECOY_HASH = bcrypt.hashSync('nonexistent-account', BCRYPT_ROUNDS);

/**
 * Consume el mismo tiempo que una comprobación real de contraseña.
 *
 * Sin esto, un correo no registrado se rechaza al instante y uno registrado tarda lo que
 * tarda bcrypt. Esa diferencia, medible desde fuera, permite averiguar qué correos tienen
 * cuenta pese a que el mensaje de error sea idéntico en ambos casos.
 */
export async function simulatePasswordCheck(password: string): Promise<void> {
  await bcrypt.compare(password, DECOY_HASH);
}
