import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';

/**
 * Política de contraseñas — fuente única de verdad: una sola regla y un solo mensaje, se
 * entre por el alta, el primer acceso, la recuperación o el perfil.
 */

const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

/** Coste de bcrypt. 10 rondas es el equilibrio habitual entre seguridad y latencia. */
const BCRYPT_ROUNDS = 10;

/**
 * Valida la robustez de una contraseña.
 * @throws BadRequestException con un mensaje que explica exactamente qué falta, para que
 *         la interfaz pueda mostrarlo tal cual al usuario.
 */
export function validateStrength(password: string): void {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new BadRequestException(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new BadRequestException(`La contraseña no puede superar los ${MAX_PASSWORD_LENGTH} caracteres.`);
  }
  if (!/[a-zA-Z]/.test(password)) {
    throw new BadRequestException('La contraseña debe incluir al menos una letra.');
  }
  if (!/[0-9]/.test(password)) {
    throw new BadRequestException('La contraseña debe incluir al menos un número.');
  }
}

/** Letras y dígitos sin los que se confunden al copiarlos a mano (0/O, 1/l/I). */
const TEMPORARY_LETTERS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const TEMPORARY_DIGITS = '23456789';
const TEMPORARY_LENGTH = 12;

/**
 * Contraseña temporal aleatoria para una cuenta nueva. Cumple la política (lleva letras y
 * números) y es distinta en cada cuenta: conocer la de una no da acceso a ninguna otra.
 */
export function generateTemporaryPassword(): string {
  const alphabet = TEMPORARY_LETTERS + TEMPORARY_DIGITS;
  const chars = Array.from({ length: TEMPORARY_LENGTH - 2 }, () => alphabet[randomInt(alphabet.length)]);
  chars.push(
    TEMPORARY_LETTERS[randomInt(TEMPORARY_LETTERS.length)],
    TEMPORARY_DIGITS[randomInt(TEMPORARY_DIGITS.length)],
  );
  // Barajado de Fisher-Yates para que la letra y el número garantizados no queden al final.
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
