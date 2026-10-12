import { refreshedPage } from './paged-list';

const row = (guid: string, version = 1) => ({ guid, version });

describe('refreshedPage', () => {
  it('sin más páginas, la primera es la lista entera y sustituye a la cargada', () => {
    const loaded = { items: [row('a'), row('b'), row('c')], cursor: null };
    const fresh = { items: [row('a', 2)], cursor: null };

    expect(refreshedPage(loaded, fresh)).toEqual(fresh);
  });

  it('con más páginas, no pierde lo cargado con «Ver más» y conserva su cursor', () => {
    const loaded = { items: [row('a'), row('b'), row('c')], cursor: 'tras-c' };
    const fresh = { items: [row('d'), row('a', 2)], cursor: 'tras-a' };

    expect(refreshedPage(loaded, fresh)).toEqual({
      items: [row('d'), row('a', 2), row('b'), row('c')],
      cursor: 'tras-c',
    });
  });
});
