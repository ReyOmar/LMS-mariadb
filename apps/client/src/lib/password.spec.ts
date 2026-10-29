import { passwordProblem } from './password';

/**
 * Las pantallas de contraseña nueva (restablecer, primer acceso y perfil) piden lo mismo que el
 * servidor. Si una pidiera menos, el usuario rellenaría el formulario, lo daría por bueno y se
 * encontraría el rechazo después.
 */
describe('passwordProblem', () => {
  it('acepta ocho caracteres con una letra, un número y un símbolo', () => {
    expect(passwordProblem('abcdef1!')).toBeNull();
  });

  it('rechaza una contraseña vacía o corta aunque tenga de todo', () => {
    expect(passwordProblem('')).toBe('La contraseña debe tener al menos 8 caracteres.');
    expect(passwordProblem('ab1!')).toBe('La contraseña debe tener al menos 8 caracteres.');
  });

  it('exige al menos una letra, un número y un símbolo', () => {
    expect(passwordProblem('12345678!')).toBe('La contraseña debe incluir al menos una letra.');
    expect(passwordProblem('abcdefgh!')).toBe('La contraseña debe incluir al menos un número.');
    expect(passwordProblem('abcdefg1')).toBe('La contraseña debe incluir al menos un símbolo, como ! # $ % o &.');
  });

  it('rechaza una contraseña más larga de lo que admite el servidor', () => {
    expect(passwordProblem(`a1!${'x'.repeat(126)}`)).toContain('no puede superar');
  });
});
