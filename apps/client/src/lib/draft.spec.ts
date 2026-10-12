import { pendingChanges } from './draft';

describe('pendingChanges', () => {
  const saved = { title: 'Hola', terms: null as string | null, limit: 10 };

  it('se queda con lo que difiere de lo guardado', () => {
    expect(pendingChanges(saved, { title: 'Adiós', limit: 10 })).toEqual({ title: 'Adiós' });
  });

  it('no cuenta un campo que se tocó y volvió a su valor', () => {
    expect(pendingChanges(saved, { title: 'Hola' })).toEqual({});
  });

  it('trata como iguales un texto vaciado y uno sin configurar', () => {
    expect(pendingChanges(saved, { terms: '' })).toEqual({});
  });

  it('sí cuenta vaciar un texto que tenía valor', () => {
    expect(pendingChanges(saved, { title: '' })).toEqual({ title: '' });
  });

  it('distingue un cero de un campo vacío', () => {
    expect(pendingChanges({ months: null as number | null }, { months: 0 })).toEqual({ months: 0 });
  });
});
