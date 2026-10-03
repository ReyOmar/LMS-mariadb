import { MIN_PASSWORD_LENGTH, passwordProblem } from './password';

/**
 * Las pantallas de contraseña nueva (restablecer, primer acceso, perfil, clave temporal de
 * la sede) piden lo mismo que el servidor. Si una pidiera menos, el usuario rellenaría el
 * formulario, lo daría por bueno y se encontraría el rechazo después.
 */
describe('passwordProblem', () => {
  it('acepta una contraseña con la longitud mínima, una letra y un número', () => {
    expect(passwordProblem('abcdefg1')).toBeNull();
  });

  it('rechaza una contraseña corta aunque tenga letras y números', () => {
    expect(passwordProblem('abc123')).toContain(`${MIN_PASSWORD_LENGTH} caracteres`);
    expect(passwordProblem('abcdef1')).not.toBeNull();
  });

  it('exige al menos una letra', () => {
    expect(passwordProblem('12345678')).toBe('La contraseña debe incluir al menos una letra.');
  });

  it('exige al menos un número', () => {
    expect(passwordProblem('abcdefgh')).toBe('La contraseña debe incluir al menos un número.');
  });

  it('rechaza una contraseña más larga de lo que admite el servidor', () => {
    expect(passwordProblem(`a1${'x'.repeat(127)}`)).toContain('no puede superar');
  });
});
