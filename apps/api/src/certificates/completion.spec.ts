import { ForbiddenException } from '@nestjs/common';
import { CertificatesService } from './certificates.service';

/**
 * Quién puede preguntar si un curso está terminado.
 *
 * La respuesta dice cuántos recursos tiene un curso y cómo se titulan sus tareas, así que
 * exige matrícula activa. La matrícula sólo existe dentro de una sede, de modo que cierra
 * a la vez el curso ajeno y el de la otra sede.
 */
describe('CertificatesService — quién puede consultar la finalización', () => {
  function serviceWith(access: { ensureEnrollment: () => Promise<void>; getCourseResources?: () => Promise<[]> }) {
    const complete = {
      getCourseResources: async () => [],
      ...access,
    };
    return new CertificatesService({} as never, complete as never, {} as never, {} as never, {} as never, {} as never);
  }

  it('rechaza a quien no está matriculado, aunque acierte el identificador', async () => {
    const service = serviceWith({
      ensureEnrollment: async () => {
        throw new ForbiddenException('No estás matriculado en este curso.');
      },
    });

    await expect(service.checkCompletion('curso-ajeno', 'alguien')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('comprueba la matrícula antes de mirar el contenido del curso', async () => {
    const order: string[] = [];
    const service = serviceWith({
      ensureEnrollment: async () => {
        order.push('matrícula');
      },
      getCourseResources: async () => {
        order.push('contenido');
        return [];
      },
    });

    await service.checkCompletion('curso-1', 'alumna');

    expect(order).toEqual(['matrícula', 'contenido']);
  });

  it('a quien sí está matriculado le responde con normalidad', async () => {
    const service = serviceWith({ ensureEnrollment: async () => undefined });

    const status = await service.checkCompletion('curso-1', 'alumna');

    expect(status.canGetCertificate).toBe(false);
    expect(status.reason).toContain('contenido');
  });
});
