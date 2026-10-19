import { AUTO_UNLOCK_HOURS, isResourceUnlocked, waitedTooLong } from './progression';

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
  describe('isResourceUnlocked', () => {
    it('el primero siempre está abierto', () => {
      expect(isResourceUnlocked(COURSE, 'r1', done())).toBe(true);
    });

    it('los siguientes esperan a los anteriores de su módulo', () => {
      expect(isResourceUnlocked(COURSE, 'r2', done())).toBe(false);
      expect(isResourceUnlocked(COURSE, 'r2', done('r1'))).toBe(true);
    });

    it('un módulo espera a que el anterior esté entero', () => {
      expect(isResourceUnlocked(COURSE, 'r3', done('r1'))).toBe(false);
      expect(isResourceUnlocked(COURSE, 'r3', done('r1', 'r2'))).toBe(true);
      expect(isResourceUnlocked(COURSE, 'r4', done('r1', 'r2'))).toBe(false);
    });

    it('completar por delante no abre lo de atrás', () => {
      expect(isResourceUnlocked(COURSE, 'r2', done('r4'))).toBe(false);
    });

    it('un módulo vacío no abre lo que viene después', () => {
      const withEmpty = [COURSE[0], { resources: [] }, COURSE[1]];

      expect(isResourceUnlocked(withEmpty, 'r3', done())).toBe(false);
      expect(isResourceUnlocked(withEmpty, 'r3', done('r1', 'r2'))).toBe(true);
    });

    it('cuenta todo lo anterior, no sólo el módulo de antes', () => {
      // Una tarea del primer módulo, suspendida después de que el segundo se completara.
      const threeModules = [...COURSE, { resources: [{ guid: 'r5' }] }];

      expect(isResourceUnlocked(threeModules, 'r5', done('r2', 'r3', 'r4'))).toBe(false);
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
