import { initials, matchesSearch, plural } from './text';

describe('matchesSearch', () => {
  it('compara sin tildes ni mayúsculas', () => {
    expect(matchesSearch('Darío Muñoz', 'dario munoz')).toBe(true);
    expect(matchesSearch('jose', 'JOSÉ')).toBe(true);
  });

  it('una búsqueda con tilde encuentra el nombre escrito sin ella, y al revés', () => {
    expect(matchesSearch('Maria Lopez', 'maría')).toBe(true);
    expect(matchesSearch('María López', 'lopez')).toBe(true);
  });

  it('ignora los espacios de los extremos y una búsqueda vacía lo encuentra todo', () => {
    expect(matchesSearch('Normativa básica', '  BASICA ')).toBe(true);
    expect(matchesSearch('Normativa básica', '')).toBe(true);
  });

  it('no encuentra lo que no está', () => {
    expect(matchesSearch('Normativa básica', 'señales')).toBe(false);
  });
});

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
