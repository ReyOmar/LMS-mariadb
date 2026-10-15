// Con orden estricto un recurso se abre al completar todos los anteriores: el certificado acredita todo
// el material. El servidor aplica la misma regla (`apps/api/src/courses/progression.ts`).

import type { CourseProgress } from '@/types/models';

interface PathModule {
  resources?: { guid: string }[];
}

type ResourceOf<M extends PathModule> = NonNullable<M['resources']>[number];

/** Avance del alumno: lo completado y lo entregado que espera nota. */
export interface PathProgress {
  completed: ReadonlySet<string>;
  awaitingGrade: ReadonlySet<string>;
}

/**
 * El avance que devuelve la API. Lo desbloqueado porque su nota tarda demasiado cuenta como
 * completado para seguir avanzando, aunque siga esperando la calificación.
 */
export function pathProgressFrom(
  progress: Pick<CourseProgress, 'completed' | 'unlockedByWait' | 'pendingAssignments'>,
): PathProgress {
  return {
    completed: new Set([...progress.completed, ...progress.unlockedByWait]),
    awaitingGrade: new Set(progress.pendingAssignments.map((assignment) => assignment.resourceGuid)),
  };
}

export interface SyllabusEntry<R> {
  resource: R;
  open: boolean;
  completed: boolean;
  awaitingGrade: boolean;
}

export interface SyllabusModule<M extends PathModule> {
  module: M;
  open: boolean;
  /** Tiene contenido y está todo completado. */
  finished: boolean;
  entries: SyllabusEntry<ResourceOf<M>>[];
}

/** El temario tal como lo ve el alumno: qué tiene abierto, qué completó y qué espera nota. */
export function buildSyllabus<M extends PathModule>(
  modules: M[],
  { completed, awaitingGrade }: PathProgress,
  strictOrder: boolean,
): SyllabusModule<M>[] {
  let everythingBeforeCompleted = true;

  return modules.map((module) => {
    const moduleOpen = !strictOrder || everythingBeforeCompleted;
    const entries = (module.resources ?? []).map((resource) => {
      const entry = {
        resource,
        open: !strictOrder || everythingBeforeCompleted,
        completed: completed.has(resource.guid),
        awaitingGrade: awaitingGrade.has(resource.guid),
      };
      everythingBeforeCompleted &&= entry.completed;
      return entry;
    });

    return {
      module,
      open: moduleOpen,
      finished: entries.length > 0 && entries.every((entry) => entry.completed),
      entries,
    };
  });
}

function allEntries<M extends PathModule>(syllabus: SyllabusModule<M>[]): SyllabusEntry<ResourceOf<M>>[] {
  return syllabus.flatMap((item) => item.entries);
}

/** Por dónde se retoma: el primer recurso pendiente o, si ya no queda ninguno, el último para repasar. */
export function resumeEntry<M extends PathModule>(syllabus: SyllabusModule<M>[]): SyllabusEntry<ResourceOf<M>> | null {
  const entries = allEntries(syllabus);
  return entries.find((entry) => !entry.completed) ?? entries.at(-1) ?? null;
}

export function findEntry<M extends PathModule>(
  syllabus: SyllabusModule<M>[],
  resourceGuid: string | null,
): SyllabusEntry<ResourceOf<M>> | null {
  return allEntries(syllabus).find((entry) => entry.resource.guid === resourceGuid) ?? null;
}

/** El primer recurso del módulo de `resourceGuid`: adonde vuelve quien suspende un cuestionario. */
export function moduleStart<M extends PathModule>(
  syllabus: SyllabusModule<M>[],
  resourceGuid: string,
): ResourceOf<M> | null {
  const owner = syllabus.find((item) => item.entries.some((entry) => entry.resource.guid === resourceGuid));
  return owner?.entries[0]?.resource ?? null;
}

/** Todo está completado y el curso tiene contenido: el servidor pudo cerrar ya la vuelta. */
export function isPathCompleted<M extends PathModule>(syllabus: SyllabusModule<M>[]): boolean {
  const entries = allEntries(syllabus);
  return entries.length > 0 && entries.every((entry) => entry.completed && !entry.awaitingGrade);
}

/** El alumno hizo todo lo suyo, pero alguna entrega espera todavía la nota del examinador. */
export function isOnlyAwaitingGrades<M extends PathModule>(syllabus: SyllabusModule<M>[]): boolean {
  const entries = allEntries(syllabus);
  return (
    entries.some((entry) => entry.awaitingGrade) && entries.every((entry) => entry.completed || entry.awaitingGrade)
  );
}
