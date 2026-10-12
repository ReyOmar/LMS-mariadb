import { imageAccept, imageFormatNames, imageFormatWarning } from './image-formats';

describe('formatos de imagen por carpeta', () => {
  it('el logotipo sólo admite PNG y JPG, como la API', () => {
    expect(imageAccept('logos')).toBe('image/png,image/jpeg');
    expect(imageFormatNames('logos')).toBe('PNG o JPG');
  });

  it('rechaza un favicon .ico antes de subirlo', () => {
    expect(imageFormatWarning({ type: 'image/x-icon' }, 'logos')).toBe('Aquí sólo se admiten imágenes PNG o JPG.');
    expect(imageFormatWarning({ type: 'image/png' }, 'logos')).toBeNull();
  });

  it('el fondo admite también los formatos web', () => {
    expect(imageFormatWarning({ type: 'image/webp' }, 'fondos')).toBeNull();
    expect(imageFormatWarning({ type: 'image/svg+xml' }, 'fondos')).toBeNull();
    expect(imageFormatWarning({ type: 'image/heic' }, 'fondos')).toMatch(/^Aquí sólo se admiten imágenes PNG, JPG/);
  });
});
