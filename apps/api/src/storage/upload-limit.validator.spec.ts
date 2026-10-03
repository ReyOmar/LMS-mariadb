import { BadRequestException } from '@nestjs/common';
import { createValidationPipe } from '../common/validation/validation.pipe';
import { UpdateResourceDto } from '../courses/dto/resources.dto';
import { UpdateSettingsDto } from '../settings/dto/update-settings.dto';

/**
 * Los límites que se configuran —el de cada tarea y el general de la sede— admiten
 * cualquier entero entre 1 MB y el tope técnico (`MAX_UPLOAD_MB`), no un máximo inventado.
 */
describe('validación de los límites de subida', () => {
  let previousCeiling: string | undefined;

  beforeAll(() => {
    previousCeiling = process.env.MAX_UPLOAD_MB;
    process.env.MAX_UPLOAD_MB = '2048';
  });

  afterAll(() => {
    if (previousCeiling === undefined) delete process.env.MAX_UPLOAD_MB;
    else process.env.MAX_UPLOAD_MB = previousCeiling;
  });

  async function validate(metatype: new () => object, body: object): Promise<string | null> {
    try {
      await createValidationPipe().transform(body, { type: 'body', metatype });
      return null;
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      return ((error as BadRequestException).getResponse() as { message: string[] }).message.join(' ');
    }
  }

  describe('límite de una tarea', () => {
    it.each([1, 10, 1024, 2048])('acepta %i MB', async (maxUploadMb) => {
      expect(await validate(UpdateResourceDto, { maxUploadMb })).toBeNull();
    });

    it('acepta dejarlo vacío para usar el general de la sede', async () => {
      expect(await validate(UpdateResourceDto, { maxUploadMb: null })).toBeNull();
    });

    it.each([0, 2049, 1.5])('rechaza %s MB diciendo el rango admitido', async (maxUploadMb) => {
      expect(await validate(UpdateResourceDto, { maxUploadMb })).toBe(
        'El límite de subida debe ser un número entero entre 1 y 2048 MB.',
      );
    });

    it('sigue al tope técnico si se cambia', async () => {
      process.env.MAX_UPLOAD_MB = '500';
      try {
        expect(await validate(UpdateResourceDto, { maxUploadMb: 600 })).toMatch(/entre 1 y 500 MB/);
      } finally {
        process.env.MAX_UPLOAD_MB = '2048';
      }
    });
  });

  describe('límite general de la sede', () => {
    it('acepta 1 GB', async () => {
      expect(await validate(UpdateSettingsDto, { maxFileMb: 1024 })).toBeNull();
    });

    it('admite omitirlo en un guardado parcial', async () => {
      expect(await validate(UpdateSettingsDto, { platformName: 'Campus' })).toBeNull();
    });

    it.each([0, 5000, null])('rechaza %s', async (maxFileMb) => {
      expect(await validate(UpdateSettingsDto, { maxFileMb })).toBe(
        'El tamaño máximo de archivo debe ser un número entero entre 1 y 2048 MB.',
      );
    });
  });
});
