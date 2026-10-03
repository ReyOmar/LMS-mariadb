import { roundedMean, percent, progressRange } from './progress';

describe('avance', () => {
  it('redondea la mitad hacia arriba, igual que Math.round con números exactos', () => {
    expect(percent(1, 8)).toBe(13); // 12,5
    expect(percent(1, 3)).toBe(33);
    expect(percent(2, 3)).toBe(67);
    expect(percent(20, 20)).toBe(100);
  });

  it('un curso sin recursos cuenta como 0 %, no como división por cero', () => {
    expect(percent(0, 0)).toBe(0);
  });

  it('coincide con Math.round en todos los casos de hasta 200 recursos', () => {
    for (let total = 1; total <= 200; total++) {
      for (let part = 0; part <= total; part++) {
        const exact = (part * 100) / total;
        // Donde la coma flotante no deja duda, los dos redondeos deben coincidir.
        if (Math.abs(exact - Math.floor(exact) - 0.5) > 1e-9) {
          expect(percent(part, total)).toBe(Math.round(exact));
        }
      }
    }
  });

  it('hace la media entera de los cursos del alumno', () => {
    expect(roundedMean([50, 51])).toBe(51); // 50,5
    expect(roundedMean([10, 20, 30])).toBe(20);
    expect(roundedMean([])).toBe(0);
  });

  it('reparte en los cuatro tramos con los mismos cortes que la gráfica', () => {
    expect([0, 25, 26, 50, 51, 75, 76, 100].map(progressRange)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
});
