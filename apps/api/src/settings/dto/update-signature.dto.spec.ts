import { BadRequestException } from '@nestjs/common';
import { createValidationPipe } from '../../common/validation/validation.pipe';
import { UpdateSignatureDto } from './update-signature.dto';

/**
 * La firma la guarda cualquier usuario con sesión, y la clave que envía se firma para
 * descargarla y se borra al reemplazarla. Sólo puede ser una imagen de la carpeta de firmas.
 */
describe('UpdateSignatureDto', () => {
  async function validate(body: object): Promise<string | null> {
    try {
      await createValidationPipe().transform(body, { type: 'body', metatype: UpdateSignatureDto });
      return null;
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      return ((error as BadRequestException).getResponse() as { message: string[] }).message.join(' ');
    }
  }

  it('acepta la clave que devuelve la subida a firmas', async () => {
    expect(await validate({ signatureUrl: 'firmas/1789941375380-b13c4b5df175.png' })).toBeNull();
  });

  it('acepta quitar la firma', async () => {
    expect(await validate({ signatureUrl: null, signatureName: null, signatureTitle: null })).toBeNull();
  });

  it.each([
    ['una ruta fuera del almacenamiento', '../prisma/schema.prisma'],
    ['un archivo de otra carpeta', 'certificados/efb6b21a-8fdd-43db-a2d8-8e4abcd24813.pdf'],
    ['el logotipo de la sede', 'logos/1789941375380-b13c4b5df175.png'],
  ])('rechaza %s', async (_case, signatureUrl) => {
    expect(await validate({ signatureUrl })).toMatch(/firma no es válida/);
  });
});
