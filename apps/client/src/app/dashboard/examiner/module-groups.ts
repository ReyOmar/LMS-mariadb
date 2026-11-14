import { groupBy } from '@/lib/group-by';
import type { ExaminerSubmission } from './types';

/** Lo que llegó de una misma tarea o cuestionario, en el orden en que llegó. */
export interface AssignmentGroup<Item> {
  /** Identifica el grupo: dos tareas pueden llamarse igual. */
  key: string;
  items: Item[];
}

export interface ModuleGroup<Item> {
  /** Identifica el grupo: dos módulos pueden llamarse igual. */
  key: string;
  moduleTitle: string;
  assignments: AssignmentGroup<Item>[];
}

/** Pliega entregas o intentos en módulo → tarea, por identificador y no por título. */
export function byModuleAndAssignment<Item extends ExaminerSubmission>(items: readonly Item[]): ModuleGroup<Item>[] {
  return Array.from(groupBy(items, moduleKeyOf), ([moduleKey, inModule]) => ({
    key: moduleKey,
    moduleTitle: inModule[0].moduleTitle || 'Módulo principal',
    assignments: Array.from(groupBy(inModule, assignmentKeyOf), ([key, inAssignment]) => ({
      key,
      items: inAssignment,
    })),
  }));
}

function moduleKeyOf(item: ExaminerSubmission): string {
  return item.moduleGuid || item.moduleTitle || 'no-module';
}

function assignmentKeyOf(item: ExaminerSubmission): string {
  return item.assignmentGuid || item.assignmentTitle || 'no-assignment';
}
