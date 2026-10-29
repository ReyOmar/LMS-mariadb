import { ChatContactsService } from './chat-contacts.service';
import { ChatAccess } from './chat-access';
import { sessionFor } from '../common/testing/test-campus';
import { chatCampus } from '../common/testing/chat-campus';

const ANA = sessionFor('STUDENT', 'COLOMBIA', 'ana');
const session = (role: 'ADMIN' | 'TEACHER' | 'STUDENT', guid: string) => sessionFor(role, 'COLOMBIA', guid);

function createService(prisma: unknown) {
  return new ChatContactsService(prisma as never, {} as never, {} as never, new ChatAccess(prisma as never));
}

/**
 * Buscar con quién abrir una conversación.
 *
 * Una sola letra casa con casi todos los de sus cursos y cuesta lo mismo que la lista
 * entera: no se busca. Sin texto sí se listan los primeros, que es como un alumno encuentra
 * a su examinador sin saber cómo se escribe su nombre.
 */
describe('ChatContactsService · buscar personas de sus cursos', () => {
  function searchBase() {
    const userQueries: { where: unknown }[] = [];
    const prisma = {
      enrollment: { findMany: async () => [{ courseGuid: 'curso-1' }] },
      course: { findMany: async () => [] },
      user: {
        findMany: async (query: { where: unknown }) => {
          userQueries.push(query);
          return [{ guid: 'bruno', firstName: 'Bruno', lastName: 'Díaz', email: 'b@x.test', role: 'TEACHER' }];
        },
      },
      chatContact: { findMany: async () => [] },
    };
    return { service: createService(prisma), userQueries };
  }

  it('con una sola letra no consulta nada', async () => {
    const { service, userQueries } = searchBase();

    expect(await service.searchCandidates(' b ', ANA)).toEqual([]);
    expect(userQueries).toHaveLength(0);
  });

  it('desde dos letras busca por nombre, apellido y correo', async () => {
    const { service, userQueries } = searchBase();

    const found = await service.searchCandidates('Br', ANA);

    expect(found).toHaveLength(1);
    expect(JSON.stringify(userQueries[0].where)).toContain('"contains":"Br"');
  });

  it('sin texto lista a los primeros de sus cursos', async () => {
    const { service, userQueries } = searchBase();

    expect(await service.searchCandidates('', ANA)).toHaveLength(1);
    expect(JSON.stringify(userQueries[0].where)).not.toContain('contains');
  });

  it('busca sin tildes: la base ya las ignora al comparar', async () => {
    const { service, userQueries } = searchBase();

    await service.searchCandidates('Díaz', ANA);

    expect(JSON.stringify(userQueries[0].where)).toContain('"contains":"Diaz"');
  });
});

describe('ChatContactsService · solicitudes de contacto', () => {
  it('reintentar una solicitud rechazada vuelve a avisar a quien la recibe', async () => {
    const { requests, contacts, notifications, emitted } = chatCampus([
      { id: 1, requesterGuid: 'ana', receiverGuid: 'carla', courseGuid: 'curso-1', status: 'REJECTED' },
    ]);

    await requests.request('carla', undefined, session('STUDENT', 'ana'));

    expect(contacts[0].status).toBe('PENDING');
    expect(notifications.map((n) => n.userGuid)).toEqual(['carla']);
    expect(emitted).toContainEqual({ event: 'contact:updated', guids: ['carla'] });
  });

  it('al aceptarla, quien la pidió ve el cambio en vivo', async () => {
    const { requests, emitted } = chatCampus([
      { id: 1, requesterGuid: 'ana', receiverGuid: 'carla', courseGuid: 'curso-1', status: 'PENDING' },
    ]);

    await requests.respond(1, true, session('STUDENT', 'carla'));

    expect(emitted).toContainEqual({ event: 'contact:updated', guids: ['ana'] });
  });

  it('no hace falta pedir contacto a quien ya se puede escribir', async () => {
    const { requests, contacts } = chatCampus();

    await expect(requests.request('bruno', undefined, session('STUDENT', 'ana'))).rejects.toThrow('no hace falta');
    expect(contacts).toHaveLength(0);
  });
});

describe('ChatContactsService · el administrador busca con quién hablar', () => {
  it('busca en toda su sede, sin exigir curso, y puede escribir a todos', async () => {
    const userQueries: { where: unknown }[] = [];
    const prisma = {
      user: {
        findMany: async (query: { where: unknown }) => {
          userQueries.push(query);
          return [{ guid: 'dario', firstName: 'Darío', lastName: 'Ruiz', email: 'd@x.test', role: 'STUDENT' }];
        },
      },
      chatContact: { findMany: async () => [] },
    };

    const found = await createService(prisma).searchCandidates('Da', session('ADMIN', 'admin'));

    const where = JSON.stringify(userQueries[0].where);
    expect(where).toContain('"country":"COLOMBIA"');
    expect(where).not.toContain('enrollments');
    expect(found).toEqual([expect.objectContaining({ guid: 'dario', canWrite: true, contactStatus: null })]);
  });
});
