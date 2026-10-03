import { elementsOutside, wrapFocusIndex } from './useDialog';

/**
 * Las dos reglas de las ventanas modales que se pueden comprobar sin navegador: por dónde
 * da la vuelta el foco con Tab y qué parte de la página se vuelve inerte.
 *
 * Si la primera falla, el teclado se escapa a la página de detrás; si falla la segunda, o
 * se puede pulsar lo que hay detrás o se bloquea la propia ventana.
 */

describe('wrapFocusIndex', () => {
  it('deja al navegador avanzar mientras no se llega a un extremo', () => {
    expect(wrapFocusIndex(3, 0, false)).toBeNull();
    expect(wrapFocusIndex(3, 1, false)).toBeNull();
    expect(wrapFocusIndex(3, 2, true)).toBeNull();
    expect(wrapFocusIndex(3, 1, true)).toBeNull();
  });

  it('da la vuelta del último al primero con Tab', () => {
    expect(wrapFocusIndex(3, 2, false)).toBe(0);
  });

  it('da la vuelta del primero al último con Mayús+Tab', () => {
    expect(wrapFocusIndex(3, 0, true)).toBe(2);
  });

  it('con un solo elemento, el foco no sale de él en ningún sentido', () => {
    expect(wrapFocusIndex(1, 0, false)).toBe(0);
    expect(wrapFocusIndex(1, 0, true)).toBe(0);
  });

  it('si el foco está fuera de la lista, entra por el principio o por el final', () => {
    expect(wrapFocusIndex(3, -1, false)).toBe(0);
    expect(wrapFocusIndex(3, -1, true)).toBe(2);
  });

  it('sin nada que enfocar no propone ningún salto', () => {
    expect(wrapFocusIndex(0, -1, false)).toBeNull();
  });
});

/** Nodo mínimo con lo que recorre `elementsOutside`: padre e hijos. */
interface FakeNode {
  name: string;
  parentElement: FakeNode | null;
  children: FakeNode[];
}

function node(name: string, children: FakeNode[] = []): FakeNode {
  const created: FakeNode = { name, parentElement: null, children };
  for (const child of children) child.parentElement = created;
  return created;
}

const names = (elements: Element[]) => elements.map((element) => (element as unknown as FakeNode).name);
const asElement = (fake: FakeNode) => fake as unknown as Element;

describe('elementsOutside', () => {
  // body
  // ├─ app ─┬─ aside
  // │       ├─ main
  // │       └─ overlay ── dialog
  // ├─ toasts
  // └─ script
  const dialog = node('dialog');
  const overlay = node('overlay', [dialog]);
  const app = node('app', [node('aside'), node('main'), overlay]);
  const body = node('body', [app, node('toasts'), node('script')]);

  it('reúne los hermanos de la ventana y de cada antecesor hasta la raíz', () => {
    expect(names(elementsOutside(asElement(dialog), asElement(body)))).toEqual(['aside', 'main', 'toasts', 'script']);
  });

  it('nunca incluye la ventana ni lo que la contiene', () => {
    const outside = names(elementsOutside(asElement(dialog), asElement(body)));
    expect(outside).not.toContain('dialog');
    expect(outside).not.toContain('overlay');
    expect(outside).not.toContain('app');
    expect(outside).not.toContain('body');
  });

  it('una ventana colgada directamente de la raíz deja fuera al resto de sus hijos', () => {
    const portal = node('portal');
    const root = node('body', [node('app'), portal]);
    expect(names(elementsOutside(asElement(portal), asElement(root)))).toEqual(['app']);
  });
});
