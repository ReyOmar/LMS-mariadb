import {
  DEFAULT_PASSING_SCORE,
  MAX_SCORE,
  MIN_SCORE,
  toScore,
  isPassing,
  formatScore,
  formatPoints,
  normalizeScore,
  quizScore,
  averageOfScores,
  passingThreshold,
} from './grading';

describe('escala de calificación', () => {
  it('opera sobre 100 puntos y aprueba a partir de 80', () => {
    expect(MIN_SCORE).toBe(0);
    expect(MAX_SCORE).toBe(100);
    expect(DEFAULT_PASSING_SCORE).toBe(80);
  });

  describe('normalizeScore', () => {
    it('recorta los valores fuera de rango en lugar de guardarlos', () => {
      expect(normalizeScore(-10)).toBe(0);
      expect(normalizeScore(140)).toBe(100);
    });

    it('trata cualquier valor no finito como 0 y no propaga NaN a la base de datos', () => {
      // Se elige 0 y no 100 a propósito: ante un dato corrupto, el riesgo de aprobar a
      // alguien que no debía es mayor que el de suspenderlo y tener que recalificar.
      expect(normalizeScore(NaN)).toBe(0);
      expect(normalizeScore(Infinity)).toBe(0);
      expect(normalizeScore(-Infinity)).toBe(0);
    });

    it('conserva dos decimales', () => {
      expect(normalizeScore(83.336)).toBe(83.34);
    });
  });

  describe('toScore', () => {
    it('distingue "sin calificar" de "sacó cero"', () => {
      expect(toScore(null)).toBeNull();
      expect(toScore(undefined)).toBeNull();
      expect(toScore(0)).toBe(0);
    });

    it('acepta el Decimal de Prisma en forma de cadena', () => {
      expect(toScore('87.50')).toBe(87.5);
    });

    it('devuelve null ante un valor que no es número', () => {
      expect(toScore('aprobado')).toBeNull();
    });
  });

  describe('passingThreshold', () => {
    it('usa el umbral del curso cuando es válido', () => {
      expect(passingThreshold(90)).toBe(90);
    });

    it('cae en el umbral por defecto ante datos ausentes o corruptos', () => {
      // Nunca debe dejar pasar una entrega por un dato que falta.
      expect(passingThreshold(null)).toBe(DEFAULT_PASSING_SCORE);
      expect(passingThreshold(-5)).toBe(DEFAULT_PASSING_SCORE);
      expect(passingThreshold(150)).toBe(DEFAULT_PASSING_SCORE);
      expect(passingThreshold('x')).toBe(DEFAULT_PASSING_SCORE);
    });
  });

  describe('isPassing', () => {
    it('aprueba justo en el umbral', () => {
      expect(isPassing(80, 80)).toBe(true);
      expect(isPassing(79.99, 80)).toBe(false);
    });

    it('no aprueba sin nota', () => {
      expect(isPassing(null, 80)).toBe(false);
    });
  });

  describe('quizScore', () => {
    it('convierte aciertos en puntos sobre 100', () => {
      expect(quizScore(8, 10)).toBe(80);
      expect(quizScore(10, 10)).toBe(100);
      expect(quizScore(0, 10)).toBe(0);
    });

    it('un cuestionario sin preguntas no puede aprobar a nadie', () => {
      expect(quizScore(0, 0)).toBe(0);
    });

    it('redondea a dos decimales', () => {
      expect(quizScore(1, 3)).toBe(33.33);
    });
  });

  describe('averageOfScores', () => {
    it('ignora las entradas sin nota', () => {
      expect(averageOfScores([90, null, 70, undefined])).toBe(80);
    });

    it('devuelve null si no hay ninguna nota', () => {
      expect(averageOfScores([])).toBeNull();
      expect(averageOfScores([null, null])).toBeNull();
    });
  });

  describe('formato', () => {
    it('muestra la escala completa', () => {
      expect(formatScore(85)).toBe('85 / 100');
      expect(formatScore(87.5)).toBe('87.5 / 100');
    });

    it('indica explícitamente cuando no hay nota', () => {
      expect(formatScore(null)).toBe('sin calificar');
      expect(formatPoints(null)).toBe('—');
    });
  });
});
