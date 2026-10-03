import { AUTO_UNLOCK_HOURS, isModuleOpen, isResourceOpen, isResourceUnlocked, waitedTooLong } from './progression';

/**
 * Orden estricto del curso en el servidor.
 *
 * Tiene que decir lo mismo que el visor del alumno: si se equivoca en un sentido, el
 * servidor rechaza lo que la pantalla ofrece; en el otro, se puede saltar el temario.
 */

/** Curso de dos módulos con dos recursos cada uno. */
const COURSE = [{ resources: [{ guid: 'r1' }, { guid: 'r2' }] }, { resources: [{ guid: 'r3' }, { guid: 'r4' }] }];

const done = (...guids: string[]) => new Set(guids);

describe('progresión del curso', () => {
  describe('isModuleOpen', () => {
    it('el primero siempre está abierto', () => {
      expect(isModuleOpen(COURSE, 0, done())).toBe(true);
    });

    it('el segundo espera a que el primero esté entero', () => {
      expect(isModuleOpen(COURSE, 1, done('r1'))).toBe(false);
      expect(isModuleOpen(COURSE, 1, done('r1', 'r2'))).toBe(true);
    });

    it('un módulo vacío no bloquea a los siguientes', () => {
      expect(isModuleOpen([{ resources: [] }, ...COURSE.slice(1)], 1, done())).toBe(true);
    });
  });

  describe('isResourceOpen', () => {
    it('los siguientes esperan a los anteriores de su módulo', () => {
      expect(isResourceOpen(COURSE, 0, 0, done())).toBe(true);
      expect(isResourceOpen(COURSE, 0, 1, done())).toBe(false);
      expect(isResourceOpen(COURSE, 0, 1, done('r1'))).toBe(true);
    });

    it('completar por delante no abre lo de atrás', () => {
      expect(isResourceOpen(COURSE, 0, 1, done('r4'))).toBe(false);
    });
  });

  describe('isResourceUnlocked', () => {
    it('localiza el recurso y aplica la regla', () => {
      expect(isResourceUnlocked(COURSE, 'r3', done('r1'))).toBe(false);
      expect(isResourceUnlocked(COURSE, 'r3', done('r1', 'r2'))).toBe(true);
      expect(isResourceUnlocked(COURSE, 'r4', done('r1', 'r2'))).toBe(false);
    });

    it('un recurso ajeno al curso no está abierto', () => {
      expect(isResourceUnlocked(COURSE, 'otro', done('r1', 'r2', 'r3', 'r4'))).toBe(false);
    });
  });

  describe('waitedTooLong', () => {
    const now = Date.UTC(2026, 5, 10, 12);
    const hoursAgo = (hours: number) => new Date(now - hours * 60 * 60 * 1000);

    it(`desbloquea una entrega que lleva ${AUTO_UNLOCK_HOURS} h esperando nota`, () => {
      expect(waitedTooLong(hoursAgo(AUTO_UNLOCK_HOURS), now)).toBe(true);
    });

    it('no desbloquea una entrega reciente ni una sin fecha', () => {
      expect(waitedTooLong(hoursAgo(AUTO_UNLOCK_HOURS - 1), now)).toBe(false);
      expect(waitedTooLong(null, now)).toBe(false);
    });
  });
});
