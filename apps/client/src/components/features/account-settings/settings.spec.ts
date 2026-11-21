import { settingsProblem, type SettingsForm } from './settings';

const NAMES: SettingsForm = {
  firstName: 'Ana',
  lastName: 'Díaz',
  currentPassword: '',
  newPassword: '',
  confirmation: '',
};
const STRONG = 'Prueba-Campus-2026!';

describe('settingsProblem', () => {
  it('el nombre y el apellido son obligatorios', () => {
    expect(settingsProblem({ ...NAMES, lastName: '  ' })).toBe('El nombre y el apellido son obligatorios.');
  });

  it('sin contraseña nueva, la contraseña no se valida', () => {
    expect(settingsProblem(NAMES)).toBeNull();
  });

  it('para cambiarla hace falta la actual', () => {
    expect(settingsProblem({ ...NAMES, newPassword: STRONG, confirmation: STRONG })).toMatch(/contraseña actual/);
  });

  it('la nueva tiene que ser segura y coincidir con su confirmación', () => {
    const changing = { ...NAMES, currentPassword: 'actual' };

    expect(settingsProblem({ ...changing, newPassword: 'corta', confirmation: 'corta' })).not.toBeNull();
    expect(settingsProblem({ ...changing, newPassword: STRONG, confirmation: `${STRONG}x` })).toMatch(/no coinciden/);
    expect(settingsProblem({ ...changing, newPassword: STRONG, confirmation: STRONG })).toBeNull();
  });
});
