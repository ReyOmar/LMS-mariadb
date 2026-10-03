import { AuthService } from './auth.service';

const USER = {
  guid: 'usuario-1',
  email: 'alumna@pesv.test',
  firstName: 'Alumna',
  country: 'COLOMBIA',
};

/**
 * Un restablecimiento no sólo cambia el hash: un JWT que ya estuviera en manos de otra
 * persona debe dejar de servir en la siguiente petición. Lo consigue dejando la cuenta sin
 * sesión vigente, que es lo único que mira el guardián.
 */
describe('AuthService · restablecer contraseña', () => {
  it('deja la cuenta sin sesión vigente y avisa al dispositivo que la tenía', async () => {
    const updates: unknown[] = [];
    const prisma = {
      user: {
        findUnique: async () => USER,
        update: async ({ data }: { data: unknown }) => {
          updates.push(data);
          return {};
        },
      },
      passwordReset: {
        findUnique: async () => ({
          id: 7,
          email: USER.email,
          used: false,
          expiresAt: new Date(Date.now() + 60_000),
        }),
        update: async () => ({}),
      },
      $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
    };
    const realtime = { revokeSession: jest.fn() };
    const service = new AuthService(prisma as never, {} as never, {} as never, realtime as never, {} as never);

    await service.resetPassword('enlace-valido', 'NuevaClave1');

    // En la misma escritura que la contraseña nueva: si una fallara, no quedaría la clave
    // cambiada con la sesión anterior aún abierta.
    expect(updates).toContainEqual(expect.objectContaining({ password: expect.any(String), currentSessionJti: null }));
    expect(realtime.revokeSession).toHaveBeenCalledWith(USER.guid, 'password_reset');
  });
});

/**
 * Lo que el acceso deja averiguar a quien no tiene la contraseña.
 *
 * Las rutas de acceso son públicas. Si responden distinto según exista o no la cuenta,
 * sirven para hacer una lista de correos registrados probando uno tras otro. Lo que se fija
 * aquí es que sin la contraseña correcta nadie se entera de nada.
 */
describe('AuthService · lo que se revela sin la contraseña', () => {
  const EMAIL = 'alguien@pesv.test';

  async function accountWith(data: Record<string, unknown>) {
    const { hashPassword } = await import('../common/domain/password');
    return {
      guid: 'cuenta-1',
      email: EMAIL,
      firstName: 'Ana',
      lastName: 'Ruiz',
      role: 'STUDENT',
      country: 'COLOMBIA',
      usesDefaultPassword: false,
      currentSessionJti: null,
      photoUrl: null,
      password: await hashPassword('ClaveBuena2026'),
      ...data,
    };
  }

  function serviceWith(account: Record<string, unknown> | null) {
    const prisma = {
      user: { findUnique: async () => account, update: async () => account },
      accessRequest: { findUnique: async () => null },
    };
    const jwt = { signAsync: async () => 'token' };
    const settings = { legalVersion: async () => '2026-09-25' };
    return new AuthService(
      prisma as never,
      jwt as never,
      {} as never,
      { revokeSession: () => undefined } as never,
      settings as never,
    );
  }

  async function errorMessageOf(promise: Promise<unknown>): Promise<string> {
    try {
      await promise;
      return 'ENTRÓ';
    } catch (error) {
      return (error as Error).message;
    }
  }

  it('una cuenta existente no se delata a quien no sabe la contraseña', async () => {
    const existing = serviceWith(await accountWith({}));
    const nonexistent = serviceWith(null);

    const withWrongPassword = await errorMessageOf(existing.login(EMAIL, 'otra-clave-1', 'COLOMBIA'));
    const noAccount = await errorMessageOf(nonexistent.login(EMAIL, 'otra-clave-1', 'COLOMBIA'));

    expect(withWrongPassword).toBe(noAccount);
  });

  it('acertar la contraseña en la sede equivocada no revela en qué sede está la cuenta', async () => {
    const existing = serviceWith(await accountWith({}));

    const wrongCountry = await errorMessageOf(existing.login(EMAIL, 'ClaveBuena2026', 'MEXICO'));
    const wrongPassword = await errorMessageOf(existing.login(EMAIL, 'otra-clave-1', 'COLOMBIA'));

    expect(wrongCountry).toBe(wrongPassword);
  });

  it('el primer acceso responde igual exista la cuenta o no', async () => {
    const withOwnPassword = serviceWith(await accountWith({ usesDefaultPassword: false }));
    const nonexistent = serviceWith(null);

    const oneResponse = await errorMessageOf(
      withOwnPassword.setInitialPassword(EMAIL, 'Temporal2026', 'NuevaClave2026'),
    );
    const another = await errorMessageOf(nonexistent.setInitialPassword(EMAIL, 'Temporal2026', 'NuevaClave2026'));

    expect(oneResponse).toBe(another);
  });

  it('una cuenta sin contraseña no se puede reclamar desde el primer acceso', async () => {
    const withoutPassword = serviceWith(await accountWith({ password: null, usesDefaultPassword: true }));

    const result = await errorMessageOf(withoutPassword.setInitialPassword(EMAIL, 'Cualquiera2026', 'NuevaClave2026'));

    expect(result).not.toBe('ENTRÓ');
  });

  it('al entrar indica si falta aceptar la política de datos vigente', async () => {
    const never = await serviceWith(await accountWith({ dataConsentVersion: null })).login(
      EMAIL,
      'ClaveBuena2026',
      'COLOMBIA',
    );
    const current = await serviceWith(await accountWith({ dataConsentVersion: '2026-09-25' })).login(
      EMAIL,
      'ClaveBuena2026',
      'COLOMBIA',
    );

    expect(never.user).toMatchObject({ consentRequired: true });
    expect(current.user).toMatchObject({ consentRequired: false });
  });
});

describe('AuthService · aprobar una solicitud de acceso', () => {
  function approvalService() {
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
        findUnique: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => (created.push(data), { guid: 'g', ...data }),
      },
      accessRequest: { update: async () => request },
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
    const service = new AuthService(
      prisma as never,
      {} as never,
      mail as never,
      { emitToRole: () => undefined } as never,
      {} as never,
    );
    return { service, created, welcomePasswords };
  }

  it('cada cuenta nace con su propia contraseña temporal, la que recibe por correo', async () => {
    const first = approvalService();
    const second = approvalService();
    await first.service.approveAccessRequest(7, 'COLOMBIA');
    await second.service.approveAccessRequest(7, 'COLOMBIA');

    const [passwordA, passwordB] = [first.welcomePasswords[0], second.welcomePasswords[0]];
    expect(passwordA).not.toBe(passwordB);
    expect(first.created[0].password).not.toBe(passwordA);
    expect(first.created[0].usesDefaultPassword).toBe(true);
  });

  it('la autorización de datos de la solicitud pasa a la cuenta como prueba', async () => {
    const { service, created } = approvalService();
    await service.approveAccessRequest(7, 'COLOMBIA');

    expect(created[0]).toMatchObject({
      dataConsentAt: new Date('2026-09-20T10:00:00Z'),
      dataConsentVersion: '2026-09-25',
    });
  });
});

describe('AuthService · rechazar una solicitud de acceso', () => {
  function rejectionService() {
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
        update: async ({ data }: { data: Record<string, unknown> }) => updates.push(data),
      },
    };
    const mail = {
      sendAccessRequestRejected: async (...args: unknown[]) => {
        notices.push(args);
        return true;
      },
    };
    const service = new AuthService(
      prisma as never,
      {} as never,
      mail as never,
      { emitToRole: () => undefined } as never,
      {} as never,
    );
    return { service, updates, notices };
  }

  it('avisa por correo a quien la envió, con el motivo', async () => {
    const { service, updates, notices } = rejectionService();

    await service.rejectAccessRequest(9, 'MEXICO', '  No pertenece a la empresa.  ');

    expect(updates[0]).toEqual({ status: 'REJECTED', rejectionReason: 'No pertenece a la empresa.' });
    expect(notices).toEqual([['rechazada@pesv.test', 'Rita', 'No pertenece a la empresa.', 'MEXICO']]);
  });

  it('sin motivo, el aviso sale igual', async () => {
    const { service, notices } = rejectionService();

    await service.rejectAccessRequest(9, 'MEXICO', '   ');

    expect(notices).toEqual([['rechazada@pesv.test', 'Rita', null, 'MEXICO']]);
  });
});
