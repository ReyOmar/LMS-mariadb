import {
  closeRoundOf,
  groupByModuleAndAssignment,
  filteredTotal,
  normalizeTypedScore,
  gradedPercent,
  statusBreakdown,
  countryTotals,
  gradingStart,
  type CourseSummary,
} from './grouping';
import type { ExaminerSubmission } from '../../types';

const COURSE: CourseSummary = {
  courseGuid: 'curso-1',
  title: 'Manejo defensivo',
  coverImage: null,
  threshold: 80,
  borderline: 60,
  total: 3000,
  pending: 1800,
  graded: 1200,
  scores: { low: 200, mid: 400, high: 600 },
};

function submission(guid: string, status: string, module: string, assignment: string): ExaminerSubmission {
  return {
    guid,
    status,
    moduleTitle: module,
    assignmentTitle: assignment,
  } as ExaminerSubmission;
}

describe('statusBreakdown', () => {
  it('reparte pendientes y calificadas', () => {
    expect(statusBreakdown(3, 7).map((p) => [p.name, p.value])).toEqual([
      ['Pendientes', 3],
      ['Calificadas', 7],
    ]);
  });

  it('sin entregas devuelve una porción gris en lugar de un hueco en blanco', () => {
    const slices = statusBreakdown(0, 0);

    expect(slices).toHaveLength(1);
    expect(slices[0].name).toBe('Sin entregas');
  });

  it('no dibuja la porción que vale cero', () => {
    expect(statusBreakdown(0, 4).map((p) => p.name)).toEqual(['Calificadas']);
  });
});

describe('groupByModuleAndAssignment', () => {
  const loaded = [
    submission('e1', 'SUBMITTED', 'Módulo 1', 'Informe'),
    submission('e2', 'GRADED', 'Módulo 1', 'Informe'),
    submission('e3', 'IN_REVIEW', 'Módulo 1', 'Evaluación'),
    submission('e4', 'GRADED', 'Módulo 2', 'Informe'),
  ];

  it('ordena en módulo → tarea → alumnos', () => {
    const modules = groupByModuleAndAssignment(loaded);

    expect(modules.map((m) => m.moduleTitle)).toEqual(['Módulo 1', 'Módulo 2']);
    expect(modules[0].assignments.map((t) => t.assignmentTitle)).toEqual(['Informe', 'Evaluación']);
  });

  it('una reenviada cuenta como pendiente: vuelve a la cola del examinador', () => {
    const [module] = groupByModuleAndAssignment(loaded);
    const assessment = module.assignments.find((t) => t.assignmentTitle === 'Evaluación')!;

    expect(assessment.pending).toBe(1);
    expect(assessment.graded).toBe(0);
  });

  it('no funde dos tareas distintas que se llaman igual', () => {
    // Agrupar por título sumaría en una sola fila los pendientes de las dos «Informe».
    const first = { ...submission('x1', 'SUBMITTED', 'Módulo 1', 'Informe'), assignmentGuid: 'informe-a' };
    const second = { ...submission('x2', 'SUBMITTED', 'Módulo 1', 'Informe'), assignmentGuid: 'informe-b' };

    const [module] = groupByModuleAndAssignment([first, second]);

    expect(module.assignments).toHaveLength(2);
    expect(module.assignments.map((t) => t.pending)).toEqual([1, 1]);
  });

  it('da a cada grupo una clave propia aunque los títulos se repitan', () => {
    const inFirst = { ...submission('y1', 'SUBMITTED', 'Módulo 1', 'Tarea'), moduleGuid: 'm1', assignmentGuid: 't1' };
    const inSecond = { ...submission('y2', 'SUBMITTED', 'Módulo 1', 'Tarea'), moduleGuid: 'm2', assignmentGuid: 't2' };

    const modules = groupByModuleAndAssignment([inFirst, inSecond]);

    expect(modules.map((m) => m.key)).toEqual(['m1', 'm2']);
    expect(modules.map((m) => m.assignments[0].key)).toEqual(['t1', 't2']);
  });

  it('las entregas sin módulo no se pierden: caen bajo un nombre por defecto', () => {
    const modules = groupByModuleAndAssignment([submission('e9', 'SUBMITTED', '', '')]);

    expect(modules[0].moduleTitle).toBe('Módulo principal');
    expect(modules[0].assignments[0].assignmentTitle).toBe('Sin título');
  });
});

describe('countryTotals', () => {
  it('suma los cursos para la portada del selector', () => {
    const other: CourseSummary = { ...COURSE, courseGuid: 'curso-2', total: 10, pending: 4, graded: 6 };

    expect(countryTotals([COURSE, other])).toEqual({ total: 3010, pending: 1804, graded: 1206 });
  });

  it('sin cursos devuelve ceros, no NaN', () => {
    expect(countryTotals([])).toEqual({ total: 0, pending: 0, graded: 0 });
  });
});

describe('gradedPercent', () => {
  it('redondea el avance de la corrección', () => {
    expect(gradedPercent({ total: 3, graded: 1 })).toBe(33);
  });

  it('un curso sin entregas está al 100 %: no hay nada pendiente', () => {
    expect(gradedPercent({ total: 0, graded: 0 })).toBe(100);
  });
});

describe('normalizeTypedScore', () => {
  it('deja pasar un entero y un decimal', () => {
    expect(normalizeTypedScore('87.5')).toBe('87.5');
  });

  it('recorta lo que pasa de la nota máxima', () => {
    expect(normalizeTypedScore('120')).toBe('100');
  });

  it('se queda con un solo decimal', () => {
    expect(normalizeTypedScore('87.55')).toBe('87.5');
  });

  it('quita las letras en vez de dejar escribir algo que luego no vale', () => {
    expect(normalizeTypedScore('8a7')).toBe('87');
  });

  it('entiende la coma decimal en lugar de pegar los dígitos', () => {
    expect(normalizeTypedScore('85,5')).toBe('85.5');
    expect(normalizeTypedScore('7,5')).toBe('7.5');
  });

  it('con la coma recién escrita deja seguir tecleando el decimal', () => {
    expect(normalizeTypedScore('85,')).toBe('85.');
  });

  it('la nota máxima no admite decimales: 100,5 no se puede guardar', () => {
    expect(normalizeTypedScore('100,5')).toBe('100');
    expect(normalizeTypedScore('100.')).toBe('100');
  });
});

describe('filteredTotal', () => {
  it('toma del servidor el recuento que corresponde al filtro', () => {
    expect(filteredTotal(COURSE, 'all')).toBe(3000);
    expect(filteredTotal(COURSE, 'pending')).toBe(1800);
    expect(filteredTotal(COURSE, 'graded')).toBe(1200);
  });
});

describe('gradingStart', () => {
  it('al corregir una nota ya puesta parte de ella', () => {
    expect(gradingStart({ status: 'GRADED', score: 87.5, feedback: 'Bien' })).toEqual({
      score: '87.5',
      feedback: 'Bien',
      previous: null,
    });
  });

  it('una versión corregida empieza vacía y enseña lo del suspenso sólo como referencia', () => {
    expect(gradingStart({ status: 'IN_REVIEW', score: 40, feedback: 'Falta el anexo' })).toEqual({
      score: '',
      feedback: '',
      previous: { score: 40, feedback: 'Falta el anexo' },
    });
  });

  it('una primera entrega no tiene nada anterior que enseñar', () => {
    expect(gradingStart({ status: 'SUBMITTED', score: null, feedback: null })).toEqual({
      score: '',
      feedback: '',
      previous: null,
    });
  });
});

describe('closeRoundOf', () => {
  const delivered = (guid: string, student: string): ExaminerSubmission =>
    ({
      ...submission(guid, 'GRADED', 'Módulo 1', 'Informe'),
      student: { guid: student },
      fileName: 'informe.pdf',
      fileUrl: `/api/storage/download/${guid}`,
      filePurged: false,
      roundClosed: false,
    }) as ExaminerSubmission;

  it('al certificarse el alumno, sus entregas cargadas pierden la descarga y conservan el nombre del archivo', () => {
    const [retired] = closeRoundOf([delivered('e1', 'ana')], 'ana');

    expect(retired).toMatchObject({ fileName: 'informe.pdf', fileUrl: null, filePurged: true, roundClosed: true });
  });

  it('no toca las entregas de los demás alumnos', () => {
    const other = delivered('e2', 'beto');

    expect(closeRoundOf([other], 'ana')).toEqual([other]);
  });
});
