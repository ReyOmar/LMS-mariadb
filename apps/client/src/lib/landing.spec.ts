import { publicContact } from './landing';

/**
 * La portada es pública: un teléfono de ceros o una dirección que pide que la actualicen
 * no pueden aparecer como si fueran los datos de la sede.
 */
describe('publicContact', () => {
  it('publica los datos reales tal cual, sin espacios de sobra', () => {
    expect(publicContact(' +57 601 234 5678 ', 'COLOMBIA')).toBe('+57 601 234 5678');
    expect(publicContact('hola@transportes.mx', 'MEXICO')).toBe('hola@transportes.mx');
    expect(publicContact('Calle 80 # 12-34, Bogotá', 'COLOMBIA')).toBe('Calle 80 # 12-34, Bogotá');
  });

  it('descarta lo vacío', () => {
    expect(publicContact('', 'COLOMBIA')).toBeNull();
    expect(publicContact('   ', 'COLOMBIA')).toBeNull();
    expect(publicContact(null, 'MEXICO')).toBeNull();
    expect(publicContact(undefined, 'MEXICO')).toBeNull();
  });

  it('descarta los textos de relleno con los que se creaban las sedes', () => {
    expect(publicContact('+57 000 000 0000', 'COLOMBIA')).toBeNull();
    expect(publicContact('+52 000 000 0000', 'MEXICO')).toBeNull();
    expect(publicContact('contacto.co@pesveducation.com', 'COLOMBIA')).toBeNull();
    expect(publicContact('Actualiza esta dirección desde el panel de administración', 'MEXICO')).toBeNull();
  });

  it('el nombre de la sede no cuenta como dirección de la oficina', () => {
    expect(publicContact('Colombia', 'COLOMBIA')).toBeNull();
    expect(publicContact('México', 'MEXICO')).toBeNull();
  });
});
