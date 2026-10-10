import { listTracker } from './useCurrentList';

/**
 * Al cambiar deprisa de filtro, la respuesta de la lista anterior puede llegar después que
 * la de la nueva: tiene que poder reconocerse para descartarla.
 */
describe('listTracker', () => {
  it('una lista nueva deja sin valor lo que estaba pendiente de la anterior', () => {
    const list = listTracker();
    const first = list.start();
    const second = list.start();

    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });

  it('la página siguiente pertenece a la lista a la vista', () => {
    const list = listTracker();
    list.start();
    const nextPage = list.extend();

    expect(nextPage()).toBe(true);
  });

  it('una página pedida antes de cambiar de lista se descarta', () => {
    const list = listTracker();
    list.start();
    const nextPage = list.extend();
    list.start();

    expect(nextPage()).toBe(false);
  });
});
