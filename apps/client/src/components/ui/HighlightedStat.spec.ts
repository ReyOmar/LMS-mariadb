import { shouldAnimateCount } from './HighlightedStat';

/**
 * Cuándo se anima la cifra de una tarjeta del panel.
 *
 * La regla parece decorativa y no lo es. La cuenta arranca en cero y sube hasta el valor
 * real; si la animación no llega a ejecutarse, lo que queda en pantalla es el cero. Estas
 * pruebas fijan que en cada caso dudoso se opte por enseñar el número sin movimiento.
 */
describe('shouldAnimateCount', () => {
  it('anima en el caso normal: pestaña a la vista y movimiento permitido', () => {
    expect(shouldAnimateCount(42, false, false)).toBe(true);
  });

  it('no anima un cero: no hay nada que contar', () => {
    expect(shouldAnimateCount(0, false, false)).toBe(false);
  });

  it('no anima si el sistema pide reducir el movimiento', () => {
    expect(shouldAnimateCount(42, true, false)).toBe(false);
  });

  it('no anima con la pestaña oculta, que es cuando el cero se quedaba fijo', () => {
    expect(shouldAnimateCount(42, false, true)).toBe(false);
  });

  it('tampoco anima con las dos condiciones a la vez', () => {
    expect(shouldAnimateCount(42, true, true)).toBe(false);
  });

  it('anima también las cifras con decimal, como el promedio', () => {
    expect(shouldAnimateCount(67.5, false, false)).toBe(true);
  });
});
