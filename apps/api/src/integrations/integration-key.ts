import { randomBytes } from 'node:crypto';
import { secretHash } from '../common/domain/secret-hash';

/** Así empiezan las claves del campus: se reconocen a simple vista en un registro o un gestor de secretos. */
const KEY_PREFIX = 'lms_';

/** Lo que se enseña de una clave en el panel: basta para distinguirla y no sirve para usarla. */
const VISIBLE_LENGTH = 12;

export interface IssuedKey {
  /** La clave entera. Sólo existe en la respuesta que la entrega: no se guarda. */
  key: string;
  hash: string;
  prefix: string;
}

/** Una clave nueva: 32 bytes aleatorios, imposibles de adivinar. */
export function issueKey(): IssuedKey {
  const key = `${KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
  return { key, hash: hashKey(key), prefix: key.slice(0, VISIBLE_LENGTH) };
}

/** Resumen con el que se guarda y se busca una clave. */
export const hashKey = secretHash;
