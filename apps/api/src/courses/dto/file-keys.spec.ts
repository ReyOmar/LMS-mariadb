import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateResourceDto } from './resources.dto';
import { UpdateCourseDto } from './courses.dto';

/**
 * Las claves de archivo que llegan en el cuerpo acaban en el borrado del almacenamiento
 * cuando se sustituyen. Sólo se admiten claves de la carpeta que corresponde.
 */
async function errorsFor<T extends object>(type: new () => T, body: object): Promise<string[]> {
  const errors = await validate(plainToInstance(type, body));
  return errors.map((error) => error.property);
}

describe('claves de almacenamiento en los DTO de cursos', () => {
  it('acepta la clave que genera la subida de material', async () => {
    expect(await errorsFor(UpdateResourceDto, { attachmentKey: 'recursos/1727000000000-a1b2c3d4e5f6.pdf' })).toEqual(
      [],
    );
  });

  it('acepta nulo para quitar el archivo', async () => {
    expect(await errorsFor(UpdateResourceDto, { attachmentKey: null, fileUrl: null })).toEqual([]);
    expect(await errorsFor(UpdateCourseDto, { coverImage: null })).toEqual([]);
  });

  it('rechaza rutas que salen de la carpeta de almacenamiento', async () => {
    expect(await errorsFor(UpdateResourceDto, { fileUrl: '../.env' })).toEqual(['fileUrl']);
    expect(await errorsFor(UpdateResourceDto, { attachmentKey: 'recursos/../../.env' })).toEqual(['attachmentKey']);
  });

  it('rechaza archivos de otras carpetas, como certificados o entregas', async () => {
    expect(await errorsFor(UpdateResourceDto, { attachmentKey: 'certificados/emitido.pdf' })).toEqual([
      'attachmentKey',
    ]);
    expect(await errorsFor(UpdateCourseDto, { coverImage: 'entregas/informe.pdf' })).toEqual(['coverImage']);
  });

  it('la portada sólo puede venir de la carpeta de portadas', async () => {
    expect(await errorsFor(UpdateCourseDto, { coverImage: 'portadas/1727000000000-a1b2c3.jpg' })).toEqual([]);
  });
});
