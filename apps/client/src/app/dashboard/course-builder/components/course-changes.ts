import type { Course, CourseModule, Resource } from '@/types/models';
import { plural } from '@/lib/text';
import { unconfiguredResources } from './resources';

/** Sólo los campos que cambian respecto al curso; `null` si no hay nada que enviar. */
export function changedFields(course: Course, changes: Partial<Course>): Partial<Course> | null {
  const changed = Object.entries(changes).filter(([field, value]) => course[field as keyof Course] !== value);
  return changed.length > 0 ? (Object.fromEntries(changed) as Partial<Course>) : null;
}

const UNSAVED_COVER_BLOCKER =
  'Antes de publicar, guarda o descarta la portada elegida: con el curso publicado ya no se puede cambiar.';

/**
 * Por qué no se puede publicar todavía: una portada elegida sin guardar o lo que un alumno no
 * podría completar.
 */
export function publishBlocker(course: Pick<Course, 'modules'>, hasUnsavedCover: boolean): string | null {
  if (hasUnsavedCover) return UNSAVED_COVER_BLOCKER;

  const unfinished = unconfiguredResources(course);
  if (unfinished.length === 0) return null;
  const names = unfinished.map((title) => `«${title}»`).join(', ');
  return `Antes de publicar, completa ${plural(unfinished.length, 'este recurso', 'estos recursos')}: ${names}. Un cuestionario necesita preguntas y un enlace, su dirección.`;
}

function count(n: number, singular: string, pluralForm: string): string {
  return `${n} ${plural(n, singular, pluralForm)}`;
}

/** Quiénes perderían el acceso; si no se pudo saber (`null`), el aviso va sin la cifra. */
function enrolledNotice(enrolled: number | null, consequenceForOne: string, consequenceForMany: string): string {
  if (!enrolled) return '';
  return enrolled === 1
    ? ` Ahora hay 1 estudiante matriculado, que ${consequenceForOne}.`
    : ` Ahora hay ${enrolled} estudiantes matriculados, que ${consequenceForMany}.`;
}

export function deletionWarning(course: Pick<Course, 'modules'>, enrolled: number | null): string {
  const modules = course.modules ?? [];
  const resources = modules.reduce((total, courseModule) => total + (courseModule.resources?.length ?? 0), 0);

  return (
    `Se borrarán de forma permanente su contenido (${count(modules.length, 'módulo', 'módulos')} y ` +
    `${count(resources, 'recurso', 'recursos')}), las matrículas —también las dadas de baja—, el avance de los ` +
    'estudiantes y sus entregas con los archivos, también las de vueltas anteriores.' +
    enrolledNotice(enrolled, 'perderá el acceso', 'perderán el acceso') +
    ' Los certificados ya emitidos se conservan y se pueden seguir verificando. No se puede deshacer.'
  );
}

/** Las tareas y los cuestionarios guardan entregas de los estudiantes. */
const GRADED_WORK = 'las entregas de los estudiantes, con sus notas y sus archivos';

export function resourceDeletionWarning(resource: Pick<Resource, 'title' | 'type'>): string {
  const graded = resource.type === 'ASSIGNMENT' ? ` y, con él, ${GRADED_WORK}` : '';
  return `Se borrará «${resource.title}»${graded}. No se puede deshacer.`;
}

export function moduleDeletionWarning(courseModule: Pick<CourseModule, 'title' | 'resources'>): string {
  const resources = courseModule.resources ?? [];
  const content =
    resources.length === 0 ? '' : resources.length === 1 ? ' con su recurso' : ` con sus ${resources.length} recursos`;
  const graded = resources.some((resource) => resource.type === 'ASSIGNMENT') ? ` y ${GRADED_WORK}` : '';
  return `Se borrará el módulo «${courseModule.title}»${content}${graded}. No se puede deshacer.`;
}

export function unpublishWarning(enrolled: number | null): string {
  return (
    'Mientras siga en Borrador, los estudiantes matriculados verán «Curso en mantenimiento» y no podrán ' +
    'avanzar. Su progreso se conserva y vuelven a entrar al publicarlo de nuevo.' +
    enrolledNotice(enrolled, 'perderá el acceso hasta entonces', 'perderán el acceso hasta entonces')
  );
}
