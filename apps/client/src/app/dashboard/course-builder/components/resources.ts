import type { Course, Resource, ResourceType } from '@/types/models';
import { displayTitle, isQuiz, linkTarget } from '@/lib/resources';
import { quizSummary } from '@/lib/quiz-config';
import { plural } from '@/lib/text';

/** Lo que el constructor ofrece crear. Un cuestionario se guarda como tarea marcada (ver `@/lib/resources`). */
export type ResourceKind = 'PARAGRAPH' | 'ASSIGNMENT' | 'QUIZ' | 'LINK';

const RESOURCE_KINDS: readonly ResourceKind[] = ['PARAGRAPH', 'ASSIGNMENT', 'QUIZ', 'LINK'];

export function isResourceKind(value: unknown): value is ResourceKind {
  return RESOURCE_KINDS.includes(value as ResourceKind);
}

export function resourceKindOf(resource: Pick<Resource, 'type' | 'title'>): ResourceKind {
  if (resource.type === 'LINK') return 'LINK';
  if (resource.type === 'ASSIGNMENT') return isQuiz(resource) ? 'QUIZ' : 'ASSIGNMENT';
  return 'PARAGRAPH';
}

/** Tipo y título con los que nace un recurso elegido en el menú «Añadir recurso». */
export function newResource(kind: ResourceKind): { type: ResourceType; title: string } {
  switch (kind) {
    case 'PARAGRAPH':
      return { type: 'TEXT', title: 'Bloque de texto' };
    case 'LINK':
      return { type: 'LINK', title: 'Enlace' };
    case 'QUIZ':
      return { type: 'ASSIGNMENT', title: 'Cuestionario' };
    case 'ASSIGNMENT':
      return { type: 'ASSIGNMENT', title: 'Tarea' };
  }
}

/** Cero intentos significa que no hay límite, no que no se pueda presentar. */
export function attemptsLabel(allowedAttempts: number): string {
  return allowedAttempts > 0
    ? `${allowedAttempts} ${plural(allowedAttempts, 'intento', 'intentos')}`
    : 'Intentos ilimitados';
}

type ConfigurableResource = Pick<
  Resource,
  'type' | 'title' | 'quizConfig' | 'contentHtml' | 'fileUrl' | 'fileDownloadUrl'
>;

/**
 * Recurso que un alumno no podría completar: un cuestionario sin preguntas o un enlace que no
 * lleva a ninguna parte. Con el orden estricto del curso, lo dejaría atascado ahí.
 */
export function isUnconfigured(resource: ConfigurableResource): boolean {
  if (isQuiz(resource)) return (quizSummary(resource.quizConfig)?.questions ?? 0) === 0;
  if (resource.type === 'LINK') return linkTarget(resource).kind === 'empty';
  return false;
}

/** Títulos de los recursos del curso que hay que completar antes de publicarlo. */
export function unconfiguredResources(course: Pick<Course, 'modules'>): string[] {
  return (course.modules ?? []).flatMap((courseModule) =>
    (courseModule.resources ?? []).filter(isUnconfigured).map((resource) => displayTitle(resource)),
  );
}
