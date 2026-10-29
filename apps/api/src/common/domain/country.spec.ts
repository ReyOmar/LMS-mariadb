import { COUNTRIES, DEFAULT_COUNTRY, countryName, normalizeCountry } from './country';

describe('separación por país', () => {
  it('opera exactamente con dos sedes', () => {
    expect(COUNTRIES).toEqual(['COLOMBIA', 'MEXICO']);
    expect(DEFAULT_COUNTRY).toBe('COLOMBIA');
  });

  describe('normalizeCountry', () => {
    it('tolera diferencias de capitalización y espacios', () => {
      expect(normalizeCountry('colombia')).toBe('COLOMBIA');
      expect(normalizeCountry('  mexico ')).toBe('MEXICO');
    });

    it('admite el nombre con tildes y el código ISO, como los envían otros sistemas', () => {
      expect(normalizeCountry('México')).toBe('MEXICO');
      expect(normalizeCountry('MX')).toBe('MEXICO');
      expect(normalizeCountry('co')).toBe('COLOMBIA');
    });

    it('no adivina: una entrada desconocida devuelve null', () => {
      // Devolver una sede por defecto aquí sería servirle a alguien los datos de la otra.
      expect(normalizeCountry('MEJICO')).toBeNull();
      expect(normalizeCountry('PE')).toBeNull();
      expect(normalizeCountry('')).toBeNull();
      expect(normalizeCountry(42)).toBeNull();
      expect(normalizeCountry(undefined)).toBeNull();
      expect(normalizeCountry({})).toBeNull();
    });
  });

  it('expone un nombre legible para mensajes al usuario', () => {
    expect(countryName('MEXICO')).toBe('México');
    expect(countryName('COLOMBIA')).toBe('Colombia');
  });
});
