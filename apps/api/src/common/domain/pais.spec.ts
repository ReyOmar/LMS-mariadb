import { PAISES, PAIS_POR_DEFECTO, esPais, nombrePais, normalizarPais } from './pais';

describe('separación por país', () => {
  it('opera exactamente con dos sedes', () => {
    expect(PAISES).toEqual(['COLOMBIA', 'MEXICO']);
    expect(PAIS_POR_DEFECTO).toBe('COLOMBIA');
  });

  describe('esPais', () => {
    it('acepta sólo los códigos declarados', () => {
      expect(esPais('COLOMBIA')).toBe(true);
      expect(esPais('MEXICO')).toBe(true);
      expect(esPais('PERU')).toBe(false);
      expect(esPais('')).toBe(false);
      expect(esPais(null)).toBe(false);
      expect(esPais(42)).toBe(false);
    });
  });

  describe('normalizarPais', () => {
    it('tolera diferencias de capitalización y espacios', () => {
      expect(normalizarPais('colombia')).toBe('COLOMBIA');
      expect(normalizarPais('  mexico ')).toBe('MEXICO');
    });

    it('no adivina: una entrada desconocida devuelve null', () => {
      // Devolver una sede por defecto aquí sería servirle a alguien los datos de la otra.
      expect(normalizarPais('MEJICO')).toBeNull();
      expect(normalizarPais(undefined)).toBeNull();
      expect(normalizarPais({})).toBeNull();
    });
  });

  it('expone un nombre legible para mensajes al usuario', () => {
    expect(nombrePais('MEXICO')).toBe('México');
    expect(nombrePais('COLOMBIA')).toBe('Colombia');
  });
});
