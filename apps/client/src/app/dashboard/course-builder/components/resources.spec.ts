import { attemptsLabel, newResource, quizSummary, resourceKindOf } from './resources';

describe('resourceKindOf', () => {
  it('distingue un cuestionario de una tarea por su marca en el título', () => {
    expect(resourceKindOf({ type: 'ASSIGNMENT', title: '[QUIZ] Normativa' })).toBe('QUIZ');
    expect(resourceKindOf({ type: 'ASSIGNMENT', title: 'Informe' })).toBe('ASSIGNMENT');
  });

  it('un texto se presenta como párrafo y un enlace como enlace', () => {
    expect(resourceKindOf({ type: 'TEXT', title: 'Lectura' })).toBe('PARAGRAPH');
    expect(resourceKindOf({ type: 'LINK', title: 'Video' })).toBe('LINK');
  });
});

describe('newResource', () => {
  it('un cuestionario nace como tarea marcada', () => {
    const created = newResource('QUIZ');
    expect(created.type).toBe('ASSIGNMENT');
    expect(resourceKindOf(created)).toBe('QUIZ');
  });
});

describe('quizSummary', () => {
  it('resume intentos, tiempo y número de preguntas', () => {
    const config = JSON.stringify({ allowedAttempts: 2, timeLimitMinutes: 30, questions: [{}, {}, {}] });
    expect(quizSummary(config)).toEqual({ allowedAttempts: 2, timeLimitMinutes: 30, questions: 3 });
  });

  it('sin configuración, o con una dañada, no hay resumen en lugar de romper la vista', () => {
    expect(quizSummary(null)).toBeNull();
    expect(quizSummary('{no es json')).toBeNull();
    expect(quizSummary('null')).toBeNull();
  });

  it('los campos que faltan cuentan como cero', () => {
    expect(quizSummary('{}')).toEqual({ allowedAttempts: 0, timeLimitMinutes: 0, questions: 0 });
  });
});

describe('attemptsLabel', () => {
  it('cero intentos es sin límite, no «0 intentos»', () => {
    expect(attemptsLabel(0)).toBe('Intentos ilimitados');
  });

  it('escribe la palabra en singular o en plural según la cifra', () => {
    expect(attemptsLabel(1)).toBe('1 intento');
    expect(attemptsLabel(3)).toBe('3 intentos');
  });
});
