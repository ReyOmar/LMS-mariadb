import { searchTerm } from './search';

describe('searchTerm', () => {
  it('recorta y devuelve undefined si no queda texto', () => {
    expect(searchTerm('  ana ')).toBe('ana');
    expect(searchTerm('   ')).toBeUndefined();
    expect(searchTerm(undefined)).toBeUndefined();
    expect(searchTerm(null)).toBeUndefined();
  });

  it('escapa los comodines de LIKE para buscarlos tal cual', () => {
    expect(searchTerm('100%_x')).toBe(String.raw`100\%\_x`);
    expect(searchTerm(String.raw`a\b`)).toBe(String.raw`a\\b`);
  });

  it('quita tildes, diéresis y la virgulilla de la ñ', () => {
    // La columna ya compara sin distinguirlas: el resultado es el mismo.
    expect(searchTerm('José Muñoz')).toBe('Jose Munoz');
    expect(searchTerm('ÁÉÍÓÚ Güell Ñáñez')).toBe('AEIOU Guell Nanez');
  });

  it('quita también las marcas escritas por separado', () => {
    // «e» seguida de la tilde combinable, como llega desde algunos teclados.
    expect(searchTerm('José')).toBe('Jose');
  });

  it('no altera letras de otros alfabetos', () => {
    expect(searchTerm('한국')).toBe('한국');
    expect(searchTerm('Łukasz Øster')).toBe('Łukasz Øster');
  });

  it('escapa los comodines después de quitar las tildes', () => {
    expect(searchTerm('está_100%')).toBe(String.raw`esta\_100\%`);
  });
});
