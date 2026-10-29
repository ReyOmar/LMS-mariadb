import { normalizePersonName } from './person-name';

/** Los nombres llegan de formularios y de otros sistemas: se guardan siempre igual. */
describe('normalizePersonName', () => {
  it.each([
    ['  laura   gómez ', 'Laura Gómez'],
    ['MARÍA JOSÉ DE LA CRUZ', 'María José de la Cruz'],
    ['JEAN-PIERRE', 'Jean-Pierre'],
    ["O'NEILL", "O'Neill"],
    ['ñandú y ávila', 'Ñandú y Ávila'],
  ])('%p, todo en mayúsculas o en minúsculas, pasa a %p', (typed, stored) => {
    expect(normalizePersonName(typed)).toBe(stored);
  });

  it('respeta un nombre que ya combina mayúsculas y minúsculas', () => {
    expect(normalizePersonName('  McDonald   de la Rosa ')).toBe('McDonald de la Rosa');
  });

  it('una partícula al principio también lleva mayúscula', () => {
    expect(normalizePersonName('DE LA ROSA')).toBe('De la Rosa');
  });
});
