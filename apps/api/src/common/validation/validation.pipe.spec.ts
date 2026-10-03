import { BadRequestException } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { createValidationPipe } from './validation.pipe';

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
}

async function messagesFor(value: object): Promise<string[]> {
  try {
    await createValidationPipe().transform(value, { type: 'query', metatype: Filter });
    return [];
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return ((error as BadRequestException).getResponse() as { message: string[] }).message;
  }
}

describe('validación de entrada', () => {
  it('traduce al español los mensajes por defecto', async () => {
    const messages = await messagesFor({ limit: 'diez' });
    expect(messages).toContain('El campo «course» debe ser texto.');
    expect(messages).toContain('El campo «limit» debe ser un número entero.');
    expect(messages.join(' ')).not.toMatch(/must|should/);
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
