import { generateTemporaryPassword, passwordProblem } from './password';

/** La política la cumple toda contraseña nueva, la elija la persona o el campus. */
describe('passwordProblem', () => {
  it('acepta ocho caracteres con una letra, un número y un símbolo', () => {
    expect(passwordProblem('abcdef1!')).toBeNull();
    expect(passwordProblem('Ñandú 2026 ¿?')).toBeNull();
  });

  it.each([
    ['', 'La contraseña debe tener al menos 8 caracteres.'],
    ['1', 'La contraseña debe tener al menos 8 caracteres.'],
    ['ab1!', 'La contraseña debe tener al menos 8 caracteres.'],
    ['12345678!', 'La contraseña debe incluir al menos una letra.'],
    ['abcdefgh!', 'La contraseña debe incluir al menos un número.'],
    ['abcdefg1', 'La contraseña debe incluir al menos un símbolo, como ! # $ % o &.'],
    ['abcd 123', 'La contraseña debe incluir al menos un símbolo, como ! # $ % o &.'],
    [`a1!${'x'.repeat(126)}`, 'La contraseña no puede superar los 128 caracteres.'],
  ])('%p: %s', (password, problem) => {
    expect(passwordProblem(password)).toBe(problem);
  });
});

describe('generateTemporaryPassword', () => {
  it('cumple la política de contraseñas', () => {
    for (let i = 0; i < 200; i++) {
      expect(passwordProblem(generateTemporaryPassword())).toBeNull();
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
