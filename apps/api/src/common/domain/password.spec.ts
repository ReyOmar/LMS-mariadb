import { generateTemporaryPassword, validateStrength } from './password';

describe('generateTemporaryPassword', () => {
  it('cumple la política de contraseñas', () => {
    for (let i = 0; i < 200; i++) {
      expect(() => validateStrength(generateTemporaryPassword())).not.toThrow();
    }
  });

  it('no usa caracteres que se confunden al copiarlos', () => {
    const sample = Array.from({ length: 200 }, generateTemporaryPassword).join('');
    expect(sample).not.toMatch(/[01OIl]/);
  });

  it('cada cuenta recibe una distinta', () => {
    const passwords = new Set(Array.from({ length: 500 }, generateTemporaryPassword));
    expect(passwords.size).toBe(500);
  });
});
