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
    return new CertificatesService(
      {} as never,
      complete as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
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

/** Lo que se le dice al alumno cuando todavía no puede obtener el certificado. */
describe('CertificatesService — qué le falta al alumno', () => {
  const RESOURCES = [
    { guid: 'lectura-1', type: 'TEXT', title: 'Lectura' },
    { guid: 'lectura-2', type: 'TEXT', title: 'Normativa' },
    { guid: 'tarea-1', type: 'ASSIGNMENT', title: 'Informe' },
    { guid: 'tarea-2', type: 'ASSIGNMENT', title: 'Plan de viaje' },
  ];

  function reasonWith(completed: string[], graded: string[]) {
    const prisma = {
      resourceProgress: { findMany: async () => completed.map((resourceGuid) => ({ resourceGuid })) },
      submission: {
        findMany: async () => graded.map((assignmentGuid) => ({ assignmentGuid, status: 'GRADED' })),
      },
    };
    const access = { ensureEnrollment: async () => undefined, getCourseResources: async () => RESOURCES };
    const service = new CertificatesService(
      prisma as never,
      access as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return service.checkCompletion('curso-1', 'alumna').then((status) => status.reason);
  }

  it('con un recurso pendiente habla en singular', async () => {
    expect(await reasonWith(['lectura-1', 'tarea-1', 'tarea-2'], ['tarea-1', 'tarea-2'])).toBe(
      'Te falta 1 recurso por completar antes de poder obtener el certificado.',
    );
  });

  it('con varios recursos pendientes habla en plural', async () => {
    expect(await reasonWith(['tarea-1', 'tarea-2'], [])).toBe(
      'Te faltan 2 recursos por completar antes de poder obtener el certificado.',
    );
  });

  it('nombra la tarea que falta por calificar, en singular', async () => {
    expect(await reasonWith(['lectura-1', 'lectura-2', 'tarea-1', 'tarea-2'], ['tarea-1'])).toBe(
      'Tu examinador todavía debe calificar 1 tarea: "Plan de viaje".',
    );
  });

  it('nombra las tareas que faltan por calificar, en plural', async () => {
    expect(await reasonWith(['lectura-1', 'lectura-2', 'tarea-1', 'tarea-2'], [])).toBe(
      'Tu examinador todavía debe calificar 2 tareas: "Informe", "Plan de viaje".',
    );
  });
});
