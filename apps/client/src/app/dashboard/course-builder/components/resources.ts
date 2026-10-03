import type { QuizConfig, Resource, ResourceType } from '@/types/models';
import { isQuiz, quizTitleOf } from '@/lib/resources';
import { plural } from '@/lib/text';

/**
 * Vocabulario del constructor de cursos.
 *
 * Lo que aquí se llama «bloque» es un recurso visto desde el editor, donde el usuario
 * elige entre cinco cosas que no coinciden con los cinco tipos de la base: una imagen se
 * guarda como enlace y un cuestionario como tarea marcada.
 *
 * Cómo se lee un recurso ya guardado —si su enlace es una imagen, un vídeo o una página—
 * vive en `@/lib/resources`, porque de eso también depende la pantalla del alumno.
 */

/** Cómo se presenta un bloque en el constructor. No coincide con `ResourceType`. */
export type ResourceKind = 'PARAGRAPH' | 'IMAGE' | 'ASSIGNMENT' | 'QUIZ' | 'LINK';

/** Tipos que puede tener un bloque ya guardado (la imagen se almacena como enlace). */
export type StoredResourceKind = Exclude<ResourceKind, 'IMAGE'>;

/** Cómo debe mostrarse un recurso ya guardado. */
export function resourceKindOf(resource: Pick<Resource, 'type' | 'title'>): StoredResourceKind {
  if (resource.type === 'LINK') return 'LINK';
  if (resource.type === 'ASSIGNMENT') return isQuiz(resource) ? 'QUIZ' : 'ASSIGNMENT';
  return 'PARAGRAPH';
}

/** Tipo y título con los que nace un bloque al elegirlo en el menú «Añadir recurso». */
export function newResource(type: ResourceKind): { type: ResourceType; title: string } {
  switch (type) {
    case 'PARAGRAPH':
      return { type: 'TEXT', title: 'Bloque de texto' };
    case 'IMAGE':
      return { type: 'LINK', title: 'Imagen' };
    case 'LINK':
      return { type: 'LINK', title: 'Video' };
    case 'QUIZ':
      return { type: 'ASSIGNMENT', title: quizTitleOf('Cuestionario') };
    case 'ASSIGNMENT':
      return { type: 'ASSIGNMENT', title: 'Tarea' };
  }
}

/** Lo que se resume de un cuestionario en la vista previa del bloque. */
export interface QuizSummary {
  allowedAttempts: number;
  timeLimitMinutes: number;
  questions: number;
}

/** La configuración viaja serializada; si está dañada se omite en vez de romper la vista. */
export function quizSummary(config: string | null | undefined): QuizSummary | null {
  if (!config) return null;
  try {
    const data = JSON.parse(config) as Partial<QuizConfig> | null;
    if (!data || typeof data !== 'object') return null;
    return {
      allowedAttempts: data.allowedAttempts ?? 0,
      timeLimitMinutes: data.timeLimitMinutes ?? 0,
      questions: Array.isArray(data.questions) ? data.questions.length : 0,
    };
  } catch {
    return null;
  }
}

/** Cero intentos significa que no hay límite, no que no se pueda presentar. */
export function attemptsLabel(allowedAttempts: number): string {
  return allowedAttempts > 0
    ? `${allowedAttempts} ${plural(allowedAttempts, 'intento', 'intentos')}`
    : 'Intentos ilimitados';
}
