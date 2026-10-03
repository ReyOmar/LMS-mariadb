import { COUNTRIES, DEFAULT_COUNTRY, isCountry, countryName, normalizeCountry } from './country';

describe('separación por país', () => {
  it('opera exactamente con dos sedes', () => {
    expect(COUNTRIES).toEqual(['COLOMBIA', 'MEXICO']);
    expect(DEFAULT_COUNTRY).toBe('COLOMBIA');
  });

  describe('isCountry', () => {
    it('acepta sólo los códigos declarados', () => {
      expect(isCountry('COLOMBIA')).toBe(true);
      expect(isCountry('MEXICO')).toBe(true);
      expect(isCountry('PERU')).toBe(false);
      expect(isCountry('')).toBe(false);
      expect(isCountry(null)).toBe(false);
      expect(isCountry(42)).toBe(false);
    });
  });

  describe('normalizeCountry', () => {
    it('tolera diferencias de capitalización y espacios', () => {
      expect(normalizeCountry('colombia')).toBe('COLOMBIA');
      expect(normalizeCountry('  mexico ')).toBe('MEXICO');
    });

    it('no adivina: una entrada desconocida devuelve null', () => {
      // Devolver una sede por defecto aquí sería servirle a alguien los datos de la otra.
      expect(normalizeCountry('MEJICO')).toBeNull();
      expect(normalizeCountry(undefined)).toBeNull();
      expect(normalizeCountry({})).toBeNull();
    });
  });

  it('expone un nombre legible para mensajes al usuario', () => {
    expect(countryName('MEXICO')).toBe('México');
    expect(countryName('COLOMBIA')).toBe('Colombia');
  });
});
