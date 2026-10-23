import { isFieldError, parseCapacity, parseDurationHours, parsePassingScore } from './course-fields';

describe('parseCapacity', () => {
  it('vacío deja el curso sin límite', () => {
    expect(parseCapacity('')).toEqual({ maxStudents: null });
    expect(parseCapacity('   ')).toEqual({ maxStudents: null });
  });

  it('acepta un entero positivo', () => {
    expect(parseCapacity(' 30 ')).toEqual({ maxStudents: 30 });
    expect(parseCapacity('1')).toEqual({ maxStudents: 1 });
  });

  it('rechaza el cero, los negativos y los decimales en vez de guardarlos', () => {
    for (const typed of ['0', '-5', '2.5']) {
      expect(isFieldError(parseCapacity(typed))).toBe(true);
    }
  });
});

describe('parsePassingScore', () => {
  it('acepta un entero dentro de la escala de notas', () => {
    expect(parsePassingScore(' 70 ')).toEqual({ passingScore: 70 });
    expect(parsePassingScore('100')).toEqual({ passingScore: 100 });
  });

  it('no puede quedar vacía ni salirse de la escala', () => {
    for (const typed of ['', '101', '-1', '70.5', 'setenta']) {
      expect(parsePassingScore(typed)).toHaveProperty('error');
    }
  });
});

describe('parseDurationHours', () => {
  it('redondea a horas enteras', () => {
    expect(parseDurationHours('7.6')).toEqual({ durationHours: 8 });
  });

  it('vacío, cero o texto dejan la duración sin declarar', () => {
    for (const typed of ['', '0', 'ocho']) {
      expect(parseDurationHours(typed)).toEqual({ durationHours: null });
    }
  });

  it('no deja pasar más horas de las que admite la API', () => {
    expect(parseDurationHours('1000')).toEqual({ durationHours: 1000 });
    expect(parseDurationHours('1500')).toHaveProperty('error');
  });
});
