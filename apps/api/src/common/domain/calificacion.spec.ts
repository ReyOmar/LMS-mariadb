import {
  NOTA_APROBACION_DEFECTO,
  NOTA_MAXIMA,
  NOTA_MINIMA,
  aNota,
  esAprobada,
  formatearNota,
  formatearPuntos,
  normalizarNota,
  notaDeCuestionario,
  promedioNotas,
  umbralAprobacion,
} from './calificacion';

describe('escala de calificación', () => {
  it('opera sobre 100 puntos y aprueba a partir de 80', () => {
    expect(NOTA_MINIMA).toBe(0);
    expect(NOTA_MAXIMA).toBe(100);
    expect(NOTA_APROBACION_DEFECTO).toBe(80);
  });

  describe('normalizarNota', () => {
    it('recorta los valores fuera de rango en lugar de guardarlos', () => {
      expect(normalizarNota(-10)).toBe(0);
      expect(normalizarNota(140)).toBe(100);
    });

    it('trata cualquier valor no finito como 0 y no propaga NaN a la base de datos', () => {
      // Se elige 0 y no 100 a propósito: ante un dato corrupto, el riesgo de aprobar a
      // alguien que no debía es mayor que el de suspenderlo y tener que recalificar.
      expect(normalizarNota(NaN)).toBe(0);
      expect(normalizarNota(Infinity)).toBe(0);
      expect(normalizarNota(-Infinity)).toBe(0);
    });

    it('conserva dos decimales', () => {
      expect(normalizarNota(83.336)).toBe(83.34);
    });
  });

  describe('aNota', () => {
    it('distingue "sin calificar" de "sacó cero"', () => {
      expect(aNota(null)).toBeNull();
      expect(aNota(undefined)).toBeNull();
      expect(aNota(0)).toBe(0);
    });

    it('acepta el Decimal de Prisma en forma de cadena', () => {
      expect(aNota('87.50')).toBe(87.5);
    });

    it('devuelve null ante un valor que no es número', () => {
      expect(aNota('aprobado')).toBeNull();
    });
  });

  describe('umbralAprobacion', () => {
    it('usa el umbral del curso cuando es válido', () => {
      expect(umbralAprobacion(90)).toBe(90);
    });

    it('cae en el umbral por defecto ante datos ausentes o corruptos', () => {
      // Nunca debe dejar pasar una entrega por un dato que falta.
      expect(umbralAprobacion(null)).toBe(NOTA_APROBACION_DEFECTO);
      expect(umbralAprobacion(-5)).toBe(NOTA_APROBACION_DEFECTO);
      expect(umbralAprobacion(150)).toBe(NOTA_APROBACION_DEFECTO);
      expect(umbralAprobacion('x')).toBe(NOTA_APROBACION_DEFECTO);
    });
  });

  describe('esAprobada', () => {
    it('aprueba justo en el umbral', () => {
      expect(esAprobada(80, 80)).toBe(true);
      expect(esAprobada(79.99, 80)).toBe(false);
    });

    it('no aprueba sin nota', () => {
      expect(esAprobada(null, 80)).toBe(false);
    });
  });

  describe('notaDeCuestionario', () => {
    it('convierte aciertos en puntos sobre 100', () => {
      expect(notaDeCuestionario(8, 10)).toBe(80);
      expect(notaDeCuestionario(10, 10)).toBe(100);
      expect(notaDeCuestionario(0, 10)).toBe(0);
    });

    it('un cuestionario sin preguntas no puede aprobar a nadie', () => {
      expect(notaDeCuestionario(0, 0)).toBe(0);
    });

    it('redondea a dos decimales', () => {
      expect(notaDeCuestionario(1, 3)).toBe(33.33);
    });
  });

  describe('promedioNotas', () => {
    it('ignora las entradas sin nota', () => {
      expect(promedioNotas([90, null, 70, undefined])).toBe(80);
    });

    it('devuelve null si no hay ninguna nota', () => {
      expect(promedioNotas([])).toBeNull();
      expect(promedioNotas([null, null])).toBeNull();
    });
  });

  describe('formato', () => {
    it('muestra la escala completa', () => {
      expect(formatearNota(85)).toBe('85 / 100');
      expect(formatearNota(87.5)).toBe('87.5 / 100');
    });

    it('indica explícitamente cuando no hay nota', () => {
      expect(formatearNota(null)).toBe('sin calificar');
      expect(formatearPuntos(null)).toBe('—');
    });
  });
});
