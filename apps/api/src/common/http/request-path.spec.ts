import { pathOf } from './request-path';

/** Al registro llega por dónde se pidió algo, no la firma de una descarga ni lo que alguien buscó. */
describe('pathOf', () => {
  it('quita la consulta', () => {
    expect(pathOf('/api/storage/download/entregas/a.pdf?exp=1&sig=abc')).toBe('/api/storage/download/entregas/a.pdf');
    expect(pathOf('/api/auth/users?search=juana')).toBe('/api/auth/users');
  });

  it('deja igual una ruta sin consulta', () => {
    expect(pathOf('/api/health')).toBe('/api/health');
  });

  it('sin dirección no hay ruta', () => {
    expect(pathOf(undefined)).toBe('');
  });
});
