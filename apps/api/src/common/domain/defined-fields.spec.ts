import { definedFields } from './defined-fields';

describe('definedFields', () => {
  const edit: { title?: string; description?: string | null; level?: string; owner?: string } = {
    title: 'Manejo defensivo',
    description: null,
    owner: 'ana',
  };

  it('deja fuera lo que no llegó', () => {
    expect(definedFields(edit, ['title', 'level'])).toEqual({ title: 'Manejo defensivo' });
  });

  it('un nulo es un valor: vacía el campo', () => {
    expect(definedFields(edit, ['description'])).toEqual({ description: null });
  });

  it('sólo copia los campos que se le piden', () => {
    expect(definedFields(edit, ['title'])).not.toHaveProperty('owner');
  });
});
