import { byModuleAndAssignment } from './module-groups';
import type { ExaminerSubmission } from './types';

function row(guid: string, module: Partial<ExaminerSubmission>, assignment: Partial<ExaminerSubmission>) {
  return { guid, ...module, ...assignment } as ExaminerSubmission;
}

const MODULE_1 = { moduleGuid: 'm1', moduleTitle: 'Normativa' };
const MODULE_2 = { moduleGuid: 'm2', moduleTitle: 'Normativa' };
const REPORT = { assignmentGuid: 't1', assignmentTitle: 'Informe' };
const EXAM = { assignmentGuid: 't2', assignmentTitle: 'Informe' };

describe('byModuleAndAssignment', () => {
  it('pliega en módulo → tarea conservando el orden de llegada', () => {
    const modules = byModuleAndAssignment([
      row('a', MODULE_1, REPORT),
      row('b', MODULE_2, REPORT),
      row('c', MODULE_1, EXAM),
    ]);

    expect(modules.map((group) => group.key)).toEqual(['m1', 'm2']);
    expect(modules[0].assignments.map((group) => group.items.map((item) => item.guid))).toEqual([['a'], ['c']]);
  });

  it('distingue por identificador lo que se llama igual', () => {
    const [module] = byModuleAndAssignment([row('a', MODULE_1, REPORT), row('b', MODULE_1, EXAM)]);

    expect(module.assignments.map((group) => group.key)).toEqual(['t1', 't2']);
  });

  it('sin identificador agrupa por título, y sin título bajo un nombre por defecto', () => {
    const untitled = { moduleTitle: '', assignmentTitle: '' };
    const [named, orphan] = byModuleAndAssignment([
      row('a', { moduleTitle: 'Señales' }, { assignmentTitle: 'Taller' }),
      row('b', untitled, untitled),
    ]);

    expect([named.key, named.assignments[0].key]).toEqual(['Señales', 'Taller']);
    expect(orphan.moduleTitle).toBe('Módulo principal');
    expect([orphan.key, orphan.assignments[0].key]).toEqual(['no-module', 'no-assignment']);
  });
});
