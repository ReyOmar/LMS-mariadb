import { BadRequestException } from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { createValidationPipe } from './validation.pipe';
import { StrictBoolean } from './transforms';

class Filter {
  @IsString()
  @MaxLength(10)
  course: string;

  @IsOptional()
  @IsIn(['pending', 'graded'], { message: 'El filtro de estado no es válido.' })
  status?: string;

  @IsOptional()
  @IsInt()
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  sinEtiqueta?: string;
}

class Answer {
  @StrictBoolean()
  @IsBoolean({ message: 'Indica si aceptas o rechazas la solicitud.' })
  accept: boolean;

  @IsOptional()
  @StrictBoolean()
  @IsBoolean()
  active?: boolean;
}

async function validate<T>(metatype: new () => T, value: object): Promise<{ value?: T; messages: string[] }> {
  try {
    const result = (await createValidationPipe().transform(value, { type: 'body', metatype })) as T;
    return { value: result, messages: [] };
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return { messages: ((error as BadRequestException).getResponse() as { message: string[] }).message };
  }
}

const messagesFor = async (value: object) => (await validate(Filter, value)).messages;

describe('validación de entrada', () => {
  it('traduce al español los mensajes por defecto', async () => {
    const messages = await messagesFor({ limit: 'diez' });
    expect(messages).toContain('El campo «curso» debe ser texto.');
    expect(messages).toContain('El campo «límite» debe ser un número entero.');
    expect(messages.join(' ')).not.toMatch(/must|should/);
  });

  it('nombra los campos en español, no con el nombre interno', async () => {
    expect(await messagesFor({ course: 'c1', search: 'demasiado' })).toEqual([
      'El campo «búsqueda» es demasiado largo.',
    ]);
  });

  it('un campo sin nombre en español se nombra tal como llegó', async () => {
    expect(await messagesFor({ course: 'c1', sinEtiqueta: 'demasiado' })).toEqual([
      'El campo «sinEtiqueta» es demasiado largo.',
    ]);
  });

  it('respeta los mensajes propios de cada DTO', async () => {
    expect(await messagesFor({ course: 'c1', status: 'pendientes' })).toEqual(['El filtro de estado no es válido.']);
  });

  it('rechaza campos que el DTO no declara, en español', async () => {
    expect(await messagesFor({ course: 'c1', curso: 'c1' })).toEqual(['El campo «curso» no está permitido.']);
  });

  it('deja pasar una entrada válida', async () => {
    expect(await messagesFor({ course: 'c1', status: 'graded', limit: '20' })).toEqual([]);
  });
});

/**
 * Booleanos estrictos.
 *
 * La conversión implícita convierte cualquier texto no vacío en `true`: sin la
 * transformación estricta, `{"accept": "false"}` aceptaría una solicitud.
 */
describe('validación de entrada · booleanos', () => {
  it.each([
    [true, true],
    [false, false],
    ['true', true],
    ['false', false],
  ])('admite %p como %p', async (received, expected) => {
    const { value, messages } = await validate(Answer, { accept: received });

    expect(messages).toEqual([]);
    expect(value?.accept).toBe(expected);
  });

  it.each(['no', 'sí', '0', '1', 0, 1, '', 'FALSE'])('rechaza %p con un mensaje en español', async (received) => {
    expect((await validate(Answer, { accept: received })).messages).toEqual([
      'Indica si aceptas o rechazas la solicitud.',
    ]);
  });

  it('sin mensaje propio, el mensaje por defecto nombra el campo en español', async () => {
    expect((await validate(Answer, { accept: true, active: 'quizá' })).messages).toEqual([
      'El campo «activa» debe ser verdadero o falso.',
    ]);
  });

  it('un booleano opcional ausente sigue siendo opcional', async () => {
    const { value, messages } = await validate(Answer, { accept: 'false' });

    expect(messages).toEqual([]);
    expect(value?.active).toBeUndefined();
  });
});
