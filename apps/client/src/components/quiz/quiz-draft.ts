import { readLocalJson, removeLocal, writeLocal } from '@/lib/local-storage';

/**
 * Copia local de las respuestas de un intento en curso, por si la pestaña se cierra a
 * mitad del examen. Sólo tiene sentido mientras el intento sigue abierto: en cuanto se
 * envía, caduca o el alumno pierde el acceso, se borra para no dejar restos en el navegador.
 */

export type QuizAnswers = Record<string, string>;

const PREFIX = 'quiz_answers_';
/** Prefijo con el que se guardaban antes; se sigue leyendo y borrando para no dejar huérfanos. */
const LEGACY_PREFIX = 'quiz_respuestas_';

export function readQuizDraft(resourceGuid: string): QuizAnswers | null {
  return readLocalJson<QuizAnswers>(PREFIX + resourceGuid) ?? readLocalJson<QuizAnswers>(LEGACY_PREFIX + resourceGuid);
}

export function saveQuizDraft(resourceGuid: string, answers: QuizAnswers): void {
  writeLocal(PREFIX + resourceGuid, JSON.stringify(answers));
  removeLocal(LEGACY_PREFIX + resourceGuid);
}

export function clearQuizDraft(resourceGuid: string): void {
  removeLocal(PREFIX + resourceGuid);
  removeLocal(LEGACY_PREFIX + resourceGuid);
}
