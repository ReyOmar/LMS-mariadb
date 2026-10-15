import { certificateFileName, formatHours, formatTimeSpent } from './certificate-text';

describe('formatHours', () => {
  it('usa el singular sólo con una hora', () => {
    expect(formatHours(1)).toBe('1 hora');
    expect(formatHours(8)).toBe('8 horas');
    expect(formatHours(0)).toBe('0 horas');
  });

  it('redondea las horas fraccionadas', () => {
    expect(formatHours(7.6)).toBe('8 horas');
  });
});

describe('formatTimeSpent', () => {
  it('por debajo del minuto no da segundos', () => {
    expect(formatTimeSpent(0)).toBe('menos de 1 min');
    expect(formatTimeSpent(59)).toBe('menos de 1 min');
  });

  it('escribe minutos y horas', () => {
    expect(formatTimeSpent(90)).toBe('2 min');
    expect(formatTimeSpent(3600)).toBe('1 h');
    expect(formatTimeSpent(5400)).toBe('1 h 30 min');
  });

  it('al redondear no llega a «60 min»: pasa a la hora siguiente', () => {
    expect(formatTimeSpent(3599)).toBe('1 h');
    expect(formatTimeSpent(7170)).toBe('2 h');
    expect(formatTimeSpent(3570)).toBe('1 h');
    expect(formatTimeSpent(3540)).toBe('59 min');
  });
});

describe('certificateFileName', () => {
  it('conserva letras con tilde, eñes y números', () => {
    expect(certificateFileName('Señalización vial 2026')).toBe('Certificado-Señalización vial 2026.pdf');
  });

  it('quita los signos que no admite un nombre de archivo', () => {
    expect(certificateFileName('Manejo: nivel 1/2 ¿básico?')).toBe('Certificado-Manejo nivel 12 básico.pdf');
  });

  it('nunca deja el nombre vacío', () => {
    expect(certificateFileName('???')).toBe('Certificado-curso.pdf');
  });
});
