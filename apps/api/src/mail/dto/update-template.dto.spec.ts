import { BadRequestException } from '@nestjs/common';
import { createValidationPipe } from '../../common/validation/validation.pipe';
import { UpdateTemplateDto } from './update-template.dto';

/** Una plantilla guardada sin asunto o sin cuerpo enviaría correos en blanco. */
describe('UpdateTemplateDto', () => {
  async function validate(body: object): Promise<string | null> {
    try {
      await createValidationPipe().transform(body, { type: 'body', metatype: UpdateTemplateDto });
      return null;
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      return ((error as BadRequestException).getResponse() as { message: string[] }).message.join(' ');
    }
  }

  it('acepta una plantilla con asunto y cuerpo', async () => {
    expect(await validate({ subject: 'Bienvenida, {{nombre}}', bodyHtml: '<p>Hola</p>' })).toBeNull();
  });

  it('acepta cambiar sólo el estado', async () => {
    expect(await validate({ active: false })).toBeNull();
  });

  it.each([
    ['vacío', ''],
    ['con sólo espacios', '   '],
  ])('rechaza un asunto %s', async (_case, subject) => {
    expect(await validate({ subject, bodyHtml: '<p>Hola</p>' })).toMatch(/asunto no puede quedar vacío/);
  });

  it('rechaza un cuerpo vacío', async () => {
    expect(await validate({ subject: 'Hola', bodyHtml: ' ' })).toMatch(/cuerpo del correo no puede quedar vacío/);
  });

  it('rechaza un asunto que no cabe en la base de datos', async () => {
    expect(await validate({ subject: 'a'.repeat(192) })).toMatch(/191 caracteres/);
  });
});
