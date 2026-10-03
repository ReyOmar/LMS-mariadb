import { parseCapacity } from './capacity';

/**
 * Un cupo de 0 no significa «sin límite»: dejaría el curso cerrado a todo el mundo. Sólo el
 * campo vacío quita el límite; cualquier otro valor tiene que ser un entero positivo.
 */
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
      expect(parseCapacity(typed)).toHaveProperty('error');
    }
  });
});
