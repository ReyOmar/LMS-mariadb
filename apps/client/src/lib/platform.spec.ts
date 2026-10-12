import { DEFAULT_PLATFORM_NAME, platformNameOf } from './platform';

describe('platformNameOf', () => {
  it('usa el nombre configurado en la sede', () => {
    expect(platformNameOf({ platformName: 'Campus Vial' })).toBe('Campus Vial');
  });

  it('cae en el de serie mientras no hay configuración', () => {
    expect(platformNameOf(null)).toBe(DEFAULT_PLATFORM_NAME);
  });

  it('trata un nombre vacío o en blanco como sin configurar', () => {
    expect(platformNameOf({ platformName: '' })).toBe(DEFAULT_PLATFORM_NAME);
    expect(platformNameOf({ platformName: '   ' })).toBe(DEFAULT_PLATFORM_NAME);
  });
});
