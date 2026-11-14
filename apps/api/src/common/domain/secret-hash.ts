import { createHash } from 'node:crypto';

/**
 * Resumen con el que se guarda y se busca un secreto aleatorio: una clave de integración, un
 * enlace de recuperación. Quien llegue a leer la base —una copia de seguridad, por ejemplo— no
 * obtiene nada con lo que entrar.
 *
 * Basta SHA-256 —no hace falta bcrypt— porque el secreto ya es aleatorio y largo: no hay
 * diccionario que probar contra el resumen, y buscarlo por él evita compararlo con todos.
 */
export function secretHash(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}
