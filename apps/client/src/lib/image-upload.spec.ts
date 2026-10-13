import { imageUploadWarning } from './image-upload';
import { IMAGE_LIMITS_MB, MIB } from './upload-limits';

const image = (type: string, mb: number) => ({ type, size: mb * MIB }) as File;

describe('imageUploadWarning', () => {
  it('una firma en PNG dentro de su tope vale', () => {
    expect(imageUploadWarning(image('image/png', 1), 'firmas')).toBeNull();
  });

  it('rechaza un formato que el certificado no sabe incrustar antes de mirar el peso', () => {
    expect(imageUploadWarning(image('image/webp', 100), 'firmas')).toBe('Aquí sólo se admiten imágenes PNG o JPG.');
  });

  it('rechaza una portada que supera su tope', () => {
    expect(imageUploadWarning(image('image/webp', IMAGE_LIMITS_MB.portadas + 1), 'portadas')).toContain('supera');
  });
});
