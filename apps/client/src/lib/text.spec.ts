import { initials, plural } from './text';

describe('plural', () => {
  it('usa el singular sólo con una unidad', () => {
    expect(plural(1, 'intento', 'intentos')).toBe('intento');
  });

  it.each([0, 2, 15])('usa el plural con %p', (count) => {
    expect(plural(count, 'intento', 'intentos')).toBe('intentos');
  });
});

describe('initials', () => {
  it('toma la primera letra del nombre y del apellido en mayúscula', () => {
    expect(initials('E2E', 'vista co')).toBe('EV');
    expect(initials('ana', 'pérez')).toBe('AP');
  });

  it('ignora los espacios de sobra', () => {
    expect(initials('  Laura ', ' Méndez')).toBe('LM');
  });

  it('con sólo el nombre devuelve una letra', () => {
    expect(initials('Laura', '')).toBe('L');
  });

  it('sin nombre devuelve un signo de interrogación', () => {
    expect(initials(undefined, null)).toBe('?');
  });
});
