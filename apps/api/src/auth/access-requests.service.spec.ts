import { AccessRequestsService } from './access-requests.service';

/**
 * Enviar una solicitud de acceso.
 *
 * La base compara los correos sin distinguir tildes: quien escribe `juan@empresa.com`
 * reutiliza la solicitud rechazada de `juan@empresá.com`. Si ésta conservara el correo
 * antiguo, la clave temporal de la aprobación saldría hacia un buzón ajeno.
 */
describe('AccessRequestsService · enviar una solicitud de acceso', () => {
  function requestService(
    previous: { id: number; email: string; status: string } | null,
    { verified = true, registered = false } = {},
  ) {
    const updates: { where: unknown; data: Record<string, unknown> }[] = [];
    const created: Record<string, unknown>[] = [];
    const tx = {
      emailVerification: { deleteMany: async () => ({ count: 1 }) },
      accessRequest: {
        update: async (args: { where: unknown; data: Record<string, unknown> }) => (
          updates.push(args),
          { id: 3, ...args.data }
        ),
        create: async ({ data }: { data: Record<string, unknown> }) => (created.push(data), { id: 4, ...data }),
      },
    };
    const prisma = {
      user: { findUnique: async () => (registered ? { guid: 'ana' } : null), findMany: async () => [] },
      emailVerification: { findFirst: async () => (verified ? { id: 1, verified: true } : null) },
      accessRequest: { findUnique: async () => previous },
      $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx),
    };
    const service = new AccessRequestsService(
      prisma as never,
      {} as never,
      { emitToRole: () => undefined } as never,
      { legalVersion: async () => '2026-09-25' } as never,
    );
    return { service, updates, created };
  }

  const DTO = {
    email: 'juan@empresa.com',
    firstName: 'Juan',
    lastName: 'Pérez',
    requestedRole: 'STUDENT',
    country: 'COLOMBIA',
    acceptsDataPolicy: true,
  };

  it('al reutilizar una solicitud antigua guarda el correo verificado, no el que tenía', async () => {
    const { service, updates, created } = requestService({ id: 3, email: 'juan@empresá.com', status: 'REJECTED' });

    await service.submit(DTO as never);

    expect(created).toEqual([]);
    expect(updates).toEqual([
      { where: { id: 3 }, data: expect.objectContaining({ email: 'juan@empresa.com', status: 'PENDING' }) },
    ]);
  });

  it('volver a pedir acceso tras un rechazo cuenta desde ahora: se fecha y se ordena como nueva', async () => {
    const { service, updates } = requestService({ id: 3, email: 'juan@empresa.com', status: 'REJECTED' });
    const before = Date.now();

    await service.submit(DTO as never);

    const { createdAt } = (updates[0] as unknown as { data: { createdAt: Date } }).data;
    expect(createdAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('sin el correo verificado no dice si tiene cuenta: eso se sabe sólo con el buzón probado', async () => {
    const { service } = requestService(null, { verified: false, registered: true });

    await expect(service.submit(DTO as never)).rejects.toThrow('Verifica tu correo electrónico');
  });

  it('sin solicitud anterior la crea con el correo escrito', async () => {
    const { service, updates, created } = requestService(null);

    await service.submit(DTO as never);

    expect(updates).toEqual([]);
    expect(created).toEqual([expect.objectContaining({ email: 'juan@empresa.com', status: 'PENDING' })]);
  });
});

describe('AccessRequestsService · aprobar una solicitud de acceso', () => {
  /** `resolvedMeanwhile`: otro administrador la resolvió entre la carga y la decisión. */
  function approvalService({ resolvedMeanwhile = false, hasAccount = false } = {}) {
    const created: Record<string, unknown>[] = [];
    const welcomePasswords: string[] = [];
    const request = {
      id: 7,
      email: 'nueva@pesv.test',
      firstName: 'Nora',
      lastName: 'Díaz',
      requestedRole: 'STUDENT',
      country: 'COLOMBIA',
      status: 'PENDING',
      consentAt: new Date('2026-09-20T10:00:00Z'),
      consentVersion: '2026-09-25',
    };
    const tx = {
      user: {
        findUnique: async () => (hasAccount ? { guid: 'ya-existe' } : null),
        create: async ({ data }: { data: Record<string, unknown> }) => (created.push(data), { guid: 'g', ...data }),
      },
      accessRequest: { updateMany: async () => ({ count: resolvedMeanwhile ? 0 : 1 }) },
    };
    const prisma = {
      accessRequest: { findFirst: async () => request },
      $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx),
    };
    const mail = {
      sendWelcome: async (_email: string, _name: string, password: string) => {
        welcomePasswords.push(password);
        return true;
      },
    };
    const service = new AccessRequestsService(
      prisma as never,
      mail as never,
      { emitToRole: () => undefined } as never,
      {} as never,
    );
    return { service, created, welcomePasswords };
  }

  it('cada cuenta nace con su propia contraseña temporal, la que recibe por correo', async () => {
    const first = approvalService();
    const second = approvalService();
    await first.service.approve(7, 'COLOMBIA');
    await second.service.approve(7, 'COLOMBIA');

    const [passwordA, passwordB] = [first.welcomePasswords[0], second.welcomePasswords[0]];
    expect(passwordA).not.toBe(passwordB);
    expect(first.created[0].password).not.toBe(passwordA);
    expect(first.created[0].usesDefaultPassword).toBe(true);
  });

  it('la autorización de datos de la solicitud pasa a la cuenta como prueba', async () => {
    const { service, created } = approvalService();
    await service.approve(7, 'COLOMBIA');

    expect(created[0]).toMatchObject({
      dataConsentAt: new Date('2026-09-20T10:00:00Z'),
      dataConsentVersion: '2026-09-25',
    });
  });

  it('si la persona ya tiene cuenta, la da por atendida sin crear otra ni escribirle', async () => {
    const { service, created, welcomePasswords } = approvalService({ hasAccount: true });

    await expect(service.approve(7, 'COLOMBIA')).resolves.toEqual({
      message: 'Esta persona ya tenía cuenta: la solicitud queda atendida sin enviarle nada.',
    });
    expect(created).toEqual([]);
    expect(welcomePasswords).toEqual([]);
  });

  it('si otro administrador la resolvió a la vez, no crea la cuenta ni envía la bienvenida', async () => {
    const { service, created, welcomePasswords } = approvalService({ resolvedMeanwhile: true });

    await expect(service.approve(7, 'COLOMBIA')).rejects.toThrow('Esta solicitud ya fue procesada.');
    expect(created).toEqual([]);
    expect(welcomePasswords).toEqual([]);
  });
});

describe('AccessRequestsService · rechazar una solicitud de acceso', () => {
  function rejectionService({ resolvedMeanwhile = false } = {}) {
    const updates: Record<string, unknown>[] = [];
    const notices: unknown[][] = [];
    const prisma = {
      accessRequest: {
        findFirst: async () => ({
          id: 9,
          email: 'rechazada@pesv.test',
          firstName: 'Rita',
          country: 'MEXICO',
          status: 'PENDING',
        }),
        updateMany: async ({ data }: { data: Record<string, unknown> }) => {
          if (resolvedMeanwhile) return { count: 0 };
          updates.push(data);
          return { count: 1 };
        },
      },
    };
    const mail = {
      sendAccessRequestRejected: async (...args: unknown[]) => {
        notices.push(args);
        return true;
      },
    };
    const service = new AccessRequestsService(
      prisma as never,
      mail as never,
      { emitToRole: () => undefined } as never,
      {} as never,
    );
    return { service, updates, notices };
  }

  it('avisa por correo a quien la envió, con el motivo', async () => {
    const { service, updates, notices } = rejectionService();

    await service.reject(9, 'MEXICO', '  No pertenece a la empresa.  ');

    expect(updates[0]).toEqual({ status: 'REJECTED', rejectionReason: 'No pertenece a la empresa.' });
    expect(notices).toEqual([['rechazada@pesv.test', 'Rita', 'No pertenece a la empresa.', 'MEXICO']]);
  });

  it('sin motivo, el aviso sale igual', async () => {
    const { service, notices } = rejectionService();

    await service.reject(9, 'MEXICO', '   ');

    expect(notices).toEqual([['rechazada@pesv.test', 'Rita', null, 'MEXICO']]);
  });

  it('si otro administrador la aprobó a la vez, no la rechaza ni avisa del rechazo', async () => {
    const { service, updates, notices } = rejectionService({ resolvedMeanwhile: true });

    await expect(service.reject(9, 'MEXICO', 'Duplicada')).rejects.toThrow('Esta solicitud ya fue procesada.');
    expect(updates).toEqual([]);
    expect(notices).toEqual([]);
  });
});
