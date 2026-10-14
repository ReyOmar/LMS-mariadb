import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DiscardUploadDto } from './discard-upload.dto';

/** Sólo se retiran por aquí las subidas de la ruta general; las entregas y los certificados, nunca. */
async function invalidFields(body: object): Promise<string[]> {
  const errors = await validate(plainToInstance(DiscardUploadDto, body));
  return errors.map((error) => error.property);
}

describe('DiscardUploadDto', () => {
  it.each([
    'portadas/1727000000000-a1b2c3.jpg',
    'recursos/1727000000000-a1b2c3.pdf',
    'firmas/1727000000000-a1b2c3.png',
  ])('acepta la clave de una subida general: %s', async (key) => {
    expect(await invalidFields({ key })).toEqual([]);
  });

  it.each(['entregas/informe.pdf', 'certificados/c1.pdf', 'avatars/foto.png', '../.env', undefined])(
    'rechaza %s',
    async (key) => {
      expect(await invalidFields({ key })).toEqual(['key']);
    },
  );
});
