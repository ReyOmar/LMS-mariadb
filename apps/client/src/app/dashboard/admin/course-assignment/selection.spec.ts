import { allSelected, toggled, toggledVisible, without } from './selection';

const ana = { guid: 'ana' };
const beto = { guid: 'beto' };
const carla = { guid: 'carla' };

const selectionOf = (...items: { guid: string }[]) => new Map(items.map((item) => [item.guid, item]));
const guids = (selection: ReadonlyMap<string, unknown>) => [...selection.keys()];

describe('selección de candidatos', () => {
  it('marca y desmarca uno', () => {
    expect(guids(toggled(selectionOf(), ana))).toEqual(['ana']);
    expect(guids(toggled(selectionOf(ana), ana))).toEqual([]);
  });

  it('sólo da por elegidos todos los visibles si hay alguno y lo están todos', () => {
    expect(allSelected(selectionOf(ana), [])).toBe(false);
    expect(allSelected(selectionOf(ana), [ana, beto])).toBe(false);
    expect(allSelected(selectionOf(ana, beto), [ana, beto])).toBe(true);
  });

  it('«seleccionar los de la lista» conserva a los elegidos en otra búsqueda', () => {
    expect(guids(toggledVisible(selectionOf(carla), [ana, beto]))).toEqual(['carla', 'ana', 'beto']);
  });

  it('con todos los visibles ya elegidos, los desmarca sin tocar a los demás', () => {
    expect(guids(toggledVisible(selectionOf(carla, ana, beto), [ana, beto]))).toEqual(['carla']);
  });

  it('quita a quien ya no es candidato y no cambia nada si no estaba elegido', () => {
    const selection = selectionOf(ana, beto);
    expect(guids(without(selection, ['ana']))).toEqual(['beto']);
    expect(without(selection, ['carla'])).toBe(selection);
  });
});
