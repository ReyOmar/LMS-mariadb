import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

/**
 * Política de contraseñas — fuente única de verdad.
 *
 * Antes las reglas estaban repartidas: el DTO de alta exigía 6 caracteres, el de
 * restablecimiento 8, el servicio de perfil comprobaba sólo la longitud y el de
 * autenticación además letra y número. El usuario recibía un requisito distinto según
 * por dónde entrara. Ahora hay una sola regla y un solo mensaje.
 */

export const LONGITUD_MINIMA = 8;
export const LONGITUD_MAXIMA = 128;

/** Coste de bcrypt. 10 rondas es el equilibrio habitual entre seguridad y latencia. */
const RONDAS_BCRYPT = 10;

/**
 * Valida la robustez de una contraseña.
 * @throws BadRequestException con un mensaje que explica exactamente qué falta, para que
 *         la interfaz pueda mostrarlo tal cual al usuario.
 */
export function validarFortaleza(contrasena: string): void {
  if (!contrasena || contrasena.length < LONGITUD_MINIMA) {
    throw new BadRequestException(`La contraseña debe tener al menos ${LONGITUD_MINIMA} caracteres.`);
  }
  if (contrasena.length > LONGITUD_MAXIMA) {
    throw new BadRequestException(`La contraseña no puede superar los ${LONGITUD_MAXIMA} caracteres.`);
  }
  if (!/[a-zA-Z]/.test(contrasena)) {
    throw new BadRequestException('La contraseña debe incluir al menos una letra.');
  }
  if (!/[0-9]/.test(contrasena)) {
    throw new BadRequestException('La contraseña debe incluir al menos un número.');
  }
}

/** Cifra una contraseña ya validada. */
export function cifrar(contrasena: string): Promise<string> {
  return bcrypt.hash(contrasena, RONDAS_BCRYPT);
}

/**
 * Compara una contraseña en claro con su hash.
 * Si la cuenta no tiene hash devuelve `false` en vez de lanzar: una cuenta sin contraseña
 * simplemente no puede autenticarse por esta vía.
 */
export function coincide(contrasena: string, hash: string | null): Promise<boolean> {
  if (!hash) return Promise.resolve(false);
  return bcrypt.compare(contrasena, hash);
}
