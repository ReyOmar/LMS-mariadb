import { parseQuizConfig, quizSummary } from './quiz-config';

describe('parseQuizConfig', () => {
  it('lee la configuración guardada', () => {
    const config = { allowedAttempts: 2, timeLimitMinutes: 30, questions: [] };

    expect(parseQuizConfig(JSON.stringify(config))).toEqual(config);
  });

  it('sin configuración, o con una dañada, devuelve null en lugar de romper la vista', () => {
    expect(parseQuizConfig(null)).toBeNull();
    expect(parseQuizConfig('{no es json')).toBeNull();
    expect(parseQuizConfig('null')).toBeNull();
  });

  it('los campos que faltan cuentan como cero', () => {
    expect(parseQuizConfig('{}')).toEqual({ allowedAttempts: 0, timeLimitMinutes: 0, questions: [] });
  });
});

describe('quizSummary', () => {
  it('resume intentos, tiempo y número de preguntas', () => {
    const config = JSON.stringify({ allowedAttempts: 2, timeLimitMinutes: 30, questions: [{}, {}, {}] });

    expect(quizSummary(config)).toEqual({ allowedAttempts: 2, timeLimitMinutes: 30, questions: 3 });
  });

  it('sin configuración no hay resumen', () => {
    expect(quizSummary(undefined)).toBeNull();
  });
});
