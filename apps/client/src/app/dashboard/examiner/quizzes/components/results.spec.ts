import {
  groupByModuleAndQuiz,
  globalStats,
  scoreDistribution,
  bestScore,
  getAttemptScore,
  resultBreakdown,
  passRate,
  stripQuizMarker,
  type CourseQuizSummary,
} from './results';
import type { SubmissionToGrade } from '@/types/models';

/**
 * Lo que la pantalla de pruebas calcula por su cuenta.
 *
 * El error fácil de este panel es **contar intentos donde hay que contar personas**: quien
 * repite un cuestionario deja varias filas, y sumarlas infla el total y hunde el promedio.
 * Las cifras del curso las cuenta el servidor sobre la mejor nota de cada alumno;
 * aquí queda el mismo criterio aplicado a lo que hay en pantalla, y la media global, que
 * es donde volvería a colarse el error si se promediaran promedios.
 */

const COURSE: CourseQuizSummary = {
  courseGuid: 'curso-1',
  title: 'Manejo defensivo',
  coverImage: null,
  threshold: 80,
  borderline: 60,
  attempts: 1500,
  assessed: 1000,
  passedCount: 449,
  failed: 551,
  average: 74.5,
  scores: { low: 216, mid: 335, high: 449 },
};

function attempt(guid: string, student: string, score: number | null, minute: number, assignment = '[QUIZ] Normativa') {
  return {
    guid,
    status: score === null ? 'DRAFT' : 'GRADED',
    score: score,
    submittedAt: new Date(2026, 0, 1, 0, minute).toISOString(),
    moduleTitle: 'Módulo 1',
    assignmentTitle: assignment,
    // Por defecto el identificador sale del título; las pruebas de homónimos lo fijan aparte.
    assignmentGuid: `guid-${assignment}`,
    student: { guid: student, firstName: 'Ana', lastName: 'Díaz', email: 'ana@pesv.test' },
  } as unknown as SubmissionToGrade;
}

describe('stripQuizMarker', () => {
  it('quita la marca interna: el examinador no tiene por qué verla', () => {
    expect(stripQuizMarker('[QUIZ] Normativa básica')).toBe('Normativa básica');
  });

  it('un cuestionario sin título sigue teniendo nombre', () => {
    expect(stripQuizMarker(null)).toBe('Sin título');
  });
});

describe('getAttemptScore y bestScore', () => {
  it('un intento a medias no tiene nota, que no es lo mismo que sacar un cero', () => {
    expect(getAttemptScore(attempt('i1', 'a1', null, 1))).toBeNull();
  });

  it('se queda con la mejor y no con la última', () => {
    expect(bestScore([attempt('i1', 'a1', 40, 1), attempt('i2', 'a1', 90, 2), attempt('i3', 'a1', 70, 3)])).toBe(90);
  });

  it('sin ningún intento corregido no hay mejor nota', () => {
    expect(bestScore([attempt('i1', 'a1', null, 1)])).toBeNull();
  });
});

describe('passRate', () => {
  it('es el porcentaje de alumnos evaluados que aprobaron', () => {
    expect(passRate({ assessed: 1000, passedCount: 449 })).toBe(45);
  });

  it('un curso sin nadie evaluado no aprueba al 100 %, aprueba al 0 %', () => {
    expect(passRate({ assessed: 0, passedCount: 0 })).toBe(0);
  });
});

describe('globalStats', () => {
  it('pondera el promedio por alumnos: un curso de diez no pesa como uno de mil', () => {
    const large: CourseQuizSummary = { ...COURSE, assessed: 1000, passedCount: 500, average: 80 };
    const small: CourseQuizSummary = {
      ...COURSE,
      courseGuid: 'curso-2',
      assessed: 10,
      passedCount: 0,
      average: 30,
    };

    const global = globalStats([large, small]);

    // La media de las medias daría 55; la de verdad es casi 80.
    expect(global.average).toBeCloseTo(79.5, 1);
    expect(global.assessed).toBe(1010);
    expect(global.failed).toBe(510);
  });

  it('sin cursos devuelve ceros, no NaN', () => {
    expect(globalStats([])).toEqual({ assessed: 0, passedCount: 0, failed: 0, average: 0, rate: 0 });
  });
});

describe('scoreDistribution', () => {
  it('describe los tramos respecto al umbral del curso', () => {
    expect(scoreDistribution(COURSE).map((t) => t.name)).toEqual([
      'Por debajo de 60',
      'Entre 60 y 79',
      '80 o más (aprobado)',
    ]);
  });

  it('el tramo alto es exactamente el recuento de aprobados del servidor', () => {
    const highBucket = scoreDistribution(COURSE).find((t) => t.name.includes('aprobado'));

    expect(highBucket?.count).toBe(COURSE.passedCount);
  });
});

describe('resultBreakdown', () => {
  it('sin nadie calificado devuelve una porción gris', () => {
    expect(resultBreakdown(0, 0)[0].name).toBe('Sin calificar');
  });

  it('no dibuja la porción que vale cero', () => {
    expect(resultBreakdown(5, 0).map((p) => p.name)).toEqual(['Aprobados']);
  });
});

describe('groupByModuleAndQuiz', () => {
  // Dos alumnos, uno con tres intentos: es el caso que infla los recuentos si se cuentan
  // filas en vez de personas. La página llega por alumno, así que su historial está entero.
  const loaded = [
    attempt('i1', 'ana', 40, 1),
    attempt('i2', 'ana', 90, 2),
    attempt('i3', 'ana', 70, 3),
    attempt('i4', 'beto', 50, 4),
  ];

  it('cuenta los intentos de cada persona, no las filas del cuestionario', () => {
    const [module] = groupByModuleAndQuiz(loaded);
    const students = module.assignments[0].students;

    expect(students).toHaveLength(2);
    expect(students.map((a) => a.attemptCount).sort()).toEqual([1, 3]);
  });

  it('a cada alumno le pone su mejor nota, no la del último intento', () => {
    const [module] = groupByModuleAndQuiz(loaded);
    const ana = module.assignments[0].students.find((a) => a.student?.guid === 'ana');

    expect(ana?.bestScore).toBe(90);
  });

  it('ordena el historial del más reciente al más antiguo, que es como se revisa', () => {
    const [module] = groupByModuleAndQuiz(loaded);
    const ana = module.assignments[0].students.find((a) => a.student?.guid === 'ana');

    expect(ana?.attempts.map((i) => i.guid)).toEqual(['i3', 'i2', 'i1']);
  });

  it('pone primero a quien mejor lo hizo: el trabajo del examinador está al final', () => {
    const [module] = groupByModuleAndQuiz(loaded);

    expect(module.assignments[0].students.map((a) => a.student?.guid)).toEqual(['ana', 'beto']);
  });

  it('promedia las mejores notas, no los intentos', () => {
    const [module] = groupByModuleAndQuiz(loaded);

    // (90 + 50) / 2, y no (40 + 90 + 70 + 50) / 4, que serían 62.5.
    expect(module.assignments[0].average).toBe(70);
  });

  it('no funde dos cuestionarios distintos que se llaman igual', () => {
    // Agrupando por título, la mejor nota de Ana podría salir de un cuestionario que no es el suyo.
    const otherWithSameName = { ...attempt('i9', 'ana', 10, 9), assignmentGuid: 'otro-cuestionario' };
    const [module] = groupByModuleAndQuiz([...loaded, otherWithSameName]);

    expect(module.assignments).toHaveLength(2);
    expect(module.assignments.map((t) => t.assignmentTitle)).toEqual(['Normativa', 'Normativa']);
    // Con títulos iguales, la clave es lo que distingue cada grupo en pantalla.
    expect(new Set(module.assignments.map((t) => t.key)).size).toBe(2);
  });

  it('separa los cuestionarios del mismo módulo', () => {
    const [module] = groupByModuleAndQuiz([...loaded, attempt('i5', 'ana', 100, 5, '[QUIZ] Señalización')]);

    expect(module.assignments.map((t) => t.assignmentTitle)).toEqual(['Normativa', 'Señalización']);
  });
});
