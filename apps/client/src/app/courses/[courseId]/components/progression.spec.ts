import { isModuleOpen, whereToResume, isResourceOpen, lastResource } from './progression';

/**
 * Orden en que el alumno recorre un curso.
 *
 * Es la regla que sostiene lo que acredita el certificado: no se salta contenido. Si el
 * cálculo se equivoca en un sentido, un alumno se queda encallado sin motivo; si lo hace
 * en el otro, termina un curso sin haber visto el material. Las dos direcciones se
 * comprueban aquí.
 */

/** Curso de dos módulos con dos recursos cada uno. */
const COURSE = [
  { guid: 'm1', resources: [{ guid: 'r1' }, { guid: 'r2' }] },
  { guid: 'm2', resources: [{ guid: 'r3' }, { guid: 'r4' }] },
];

describe('isModuleOpen', () => {
  it('el primero siempre está abierto', () => {
    expect(isModuleOpen(COURSE, 0, [])).toBe(true);
  });

  it('el segundo espera a que el primero esté entero', () => {
    expect(isModuleOpen(COURSE, 1, [])).toBe(false);
    expect(isModuleOpen(COURSE, 1, ['r1'])).toBe(false);
    expect(isModuleOpen(COURSE, 1, ['r1', 'r2'])).toBe(true);
  });

  it('un módulo vacío no bloquea a los siguientes', () => {
    const withEmpty = [{ guid: 'm1', resources: [] }, ...COURSE.slice(1)];
    expect(isModuleOpen(withEmpty, 1, [])).toBe(true);
  });
});

describe('isResourceOpen', () => {
  it('el primero de un módulo abierto está disponible', () => {
    expect(isResourceOpen(COURSE, 0, 0, [])).toBe(true);
  });

  it('los siguientes esperan a los anteriores de su módulo', () => {
    expect(isResourceOpen(COURSE, 0, 1, [])).toBe(false);
    expect(isResourceOpen(COURSE, 0, 1, ['r1'])).toBe(true);
  });

  it('no se puede entrar por el primer recurso de un módulo cerrado', () => {
    expect(isResourceOpen(COURSE, 1, 0, ['r1'])).toBe(false);
    expect(isResourceOpen(COURSE, 1, 0, ['r1', 'r2'])).toBe(true);
  });

  it('completar por delante no abre lo de atrás', () => {
    // Haber hecho r4 no justifica saltarse r1.
    expect(isResourceOpen(COURSE, 0, 1, ['r4'])).toBe(false);
  });
});

describe('whereToResume', () => {
  it('lleva al primer recurso sin completar', () => {
    expect(whereToResume(COURSE, [])).toEqual({
      resourceGuid: 'r1',
      moduleGuid: 'm1',
      moduleIndex: 0,
      resourceIndex: 0,
    });
    expect(whereToResume(COURSE, ['r1', 'r2'])?.resourceGuid).toBe('r3');
  });

  it('salta los huecos: retoma en el primero pendiente, no en el siguiente al último hecho', () => {
    expect(whereToResume(COURSE, ['r2', 'r3'])?.resourceGuid).toBe('r1');
  });

  it('devuelve nulo cuando ya no queda nada', () => {
    expect(whereToResume(COURSE, ['r1', 'r2', 'r3', 'r4'])).toBeNull();
  });

  it('un curso sin contenido no lleva a ninguna parte', () => {
    expect(whereToResume([], [])).toBeNull();
    expect(whereToResume([{ guid: 'm1', resources: [] }], [])).toBeNull();
  });
});

describe('lastResource', () => {
  it('es el último del último módulo con contenido', () => {
    expect(lastResource(COURSE)?.resourceGuid).toBe('r4');
  });

  it('se salta los módulos vacíos del final', () => {
    expect(lastResource([...COURSE, { guid: 'm3', resources: [] }])?.resourceGuid).toBe('r4');
  });

  it('un curso vacío no tiene último', () => {
    expect(lastResource([])).toBeNull();
  });
});
