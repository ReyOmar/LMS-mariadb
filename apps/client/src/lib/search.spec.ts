import { isSearchTooShort, searchQuery } from './search';

describe('búsqueda en el servidor', () => {
  it('no filtra con una sola letra y lo avisa', () => {
    expect(searchQuery(' a ')).toBe('');
    expect(isSearchTooShort(' a ')).toBe(true);
  });

  it('busca desde dos caracteres, sin los espacios de los extremos', () => {
    expect(searchQuery('  an ')).toBe('an');
    expect(isSearchTooShort('an')).toBe(false);
  });

  it('sin texto lista los primeros sin avisar de nada', () => {
    expect(searchQuery('   ')).toBe('');
    expect(isSearchTooShort('   ')).toBe(false);
  });
});
