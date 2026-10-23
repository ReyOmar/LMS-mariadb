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
 * La base compara los correos sin distinguir tildes: `alumna@pesv.tést` encuentra la cuenta
 * de `alumna@pesv.test`. Si el enlace saliera hacia lo escrito, quien controle ese otro
 * dominio recibiría la llave de una cuenta ajena.
 */
describe('AuthService · pedir un enlace de recuperación', () => {
  it('lo envía al correo guardado en la cuenta, no al escrito en el formulario', async () => {
    const created: { email: string }[] = [];
    const prisma = {
      user: { findUnique: async () => USER },
      passwordReset: {
        updateMany: async () => ({ count: 0 }),
        create: async ({ data }: { data: { email: string } }) => {
          created.push(data);
          return data;
        },
      },
      $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
    };
    const mail = { sendPasswordReset: jest.fn(async () => true) };
    const service = new AuthService(prisma as never, {} as never, mail as never, {} as never, {} as never);

    await service.requestPasswordReset('alumna@pesv.tést');

    expect(mail.sendPasswordReset).toHaveBeenCalledWith(USER.email, expect.any(String), USER.firstName, USER.country);
    expect(created).toEqual([expect.objectContaining({ email: USER.email })]);
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

/**
 * Enviar una solicitud de acceso.
 *
 * La base compara los correos sin distinguir tildes: quien escribe `juan@empresa.com`
 * reutiliza la solicitud rechazada de `juan@empresá.com`. Si ésta conservara el correo
 * antiguo, la clave temporal de la aprobación saldría hacia un buzón ajeno.
 */
describe('AuthService · enviar una solicitud de acceso', () => {
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
    const service = new AuthService(
      prisma as never,
      {} as never,
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

    await service.requestAccess(DTO as never);

    expect(created).toEqual([]);
    expect(updates).toEqual([
      { where: { id: 3 }, data: expect.objectContaining({ email: 'juan@empresa.com', status: 'PENDING' }) },
    ]);
  });

  it('volver a pedir acceso tras un rechazo cuenta desde ahora: se fecha y se ordena como nueva', async () => {
    const { service, updates } = requestService({ id: 3, email: 'juan@empresa.com', status: 'REJECTED' });
    const before = Date.now();

    await service.requestAccess(DTO as never);

    const { createdAt } = (updates[0] as unknown as { data: { createdAt: Date } }).data;
    expect(createdAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('sin el correo verificado no dice si tiene cuenta: eso se sabe sólo con el buzón probado', async () => {
    const { service } = requestService(null, { verified: false, registered: true });

    await expect(service.requestAccess(DTO as never)).rejects.toThrow('Verifica tu correo electrónico');
  });

  it('sin solicitud anterior la crea con el correo escrito', async () => {
    const { service, updates, created } = requestService(null);

    await service.requestAccess(DTO as never);

    expect(updates).toEqual([]);
    expect(created).toEqual([expect.objectContaining({ email: 'juan@empresa.com', status: 'PENDING' })]);
  });
});

describe('AuthService · aprobar una solicitud de acceso', () => {
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

  it('si la persona ya tiene cuenta, la da por atendida sin crear otra ni escribirle', async () => {
    const { service, created, welcomePasswords } = approvalService({ hasAccount: true });

    await expect(service.approveAccessRequest(7, 'COLOMBIA')).resolves.toEqual({
      message: 'Esta persona ya tenía cuenta: la solicitud queda atendida sin enviarle nada.',
    });
    expect(created).toEqual([]);
    expect(welcomePasswords).toEqual([]);
  });

  it('si otro administrador la resolvió a la vez, no crea la cuenta ni envía la bienvenida', async () => {
    const { service, created, welcomePasswords } = approvalService({ resolvedMeanwhile: true });

    await expect(service.approveAccessRequest(7, 'COLOMBIA')).rejects.toThrow('Esta solicitud ya fue procesada.');
    expect(created).toEqual([]);
    expect(welcomePasswords).toEqual([]);
  });
});

describe('AuthService · rechazar una solicitud de acceso', () => {
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

  it('si otro administrador la aprobó a la vez, no la rechaza ni avisa del rechazo', async () => {
    const { service, updates, notices } = rejectionService({ resolvedMeanwhile: true });

    await expect(service.rejectAccessRequest(9, 'MEXICO', 'Duplicada')).rejects.toThrow(
      'Esta solicitud ya fue procesada.',
    );
    expect(updates).toEqual([]);
    expect(notices).toEqual([]);
  });
});

/**
 * Código de verificación del correo.
 *
 * Seis dígitos se adivinan si se pueden probar sin límite. El límite de intentos tiene que
 * aguantar también muchas peticiones a la vez, que es como se intentaría saltar.
 */
describe('AuthService · confirmar el código de verificación', () => {
  function verificationService(code = '123456') {
    const stored = {
      id: 1,
      email: 'nueva@pesv.test',
      code,
      verified: false,
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
    };
    const prisma = {
      emailVerification: {
        // Cada petición lee el registro antes de que ninguna haya sumado su intento.
        findFirst: async () => ({ ...stored, attempts: 0 }),
        updateMany: async ({
          where,
          data,
        }: {
          where: { attempts?: { lt: number } };
          data: Record<string, unknown>;
        }) => {
          if (where.attempts && stored.attempts >= where.attempts.lt) return { count: 0 };
          if (data.attempts) stored.attempts++;
          return { count: 1 };
        },
        update: async ({ data }: { data: { verified: boolean } }) => Object.assign(stored, data),
      },
    };
    const service = new AuthService(prisma as never, {} as never, {} as never, {} as never, {} as never);
    return { service, stored };
  }

  it('acepta el código correcto', async () => {
    const { service, stored } = verificationService();

    await expect(service.confirmEmailVerification('nueva@pesv.test', '123456')).resolves.toMatchObject({
      verified: true,
    });
    expect(stored.verified).toBe(true);
  });

  it('un fallo dice cuántos intentos quedan', async () => {
    const { service } = verificationService();

    await expect(service.confirmEmailVerification('nueva@pesv.test', '000000')).rejects.toThrow(
      'El código no es correcto. Te quedan 4 intentos.',
    );
  });

  it('muchas peticiones a la vez no prueban más códigos de los permitidos', async () => {
    const { service, stored } = verificationService();
    const guesses = ['000001', '000002', '000003', '000004', '000005', '123456'];

    const results = await Promise.allSettled(
      guesses.map((guess) => service.confirmEmailVerification('nueva@pesv.test', guess)),
    );

    // El sexto, aunque sea el correcto, llega con los cinco intentos ya gastados.
    expect(results[5]).toMatchObject({ status: 'rejected', reason: { message: expect.stringMatching(/agotado/) } });
    expect(stored.verified).toBe(false);
    expect(stored.attempts).toBe(5);
  });
});

/**
 * Pedir el código de verificación.
 *
 * Quien recarga la página o vuelve atrás pide otro código antes de que pase el minuto de
 * espera. Ya tiene uno válido en su bandeja: no se le envía otro, pero tampoco se le cierra
 * el paso a escribirlo.
 */
describe('AuthService · pedir el código de verificación', () => {
  function codeService(
    recent: { createdAt: Date } | null,
    request: { status: string; country: string } | null = null,
    account: { firstName: string; country: string } | null = null,
  ) {
    const created: unknown[] = [];
    const prisma = {
      user: { findUnique: async () => account },
      accessRequest: { findUnique: async () => request },
      emailVerification: {
        findFirst: async () => recent,
        deleteMany: async () => ({ count: 0 }),
        create: async ({ data }: { data: unknown }) => {
          created.push(data);
          return data;
        },
      },
      $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
    };
    const mail = {
      sendVerificationCode: jest.fn().mockResolvedValue(undefined),
      sendAccountExists: jest.fn().mockResolvedValue(undefined),
      sendAccessRequestPending: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AuthService(prisma as never, {} as never, mail as never, {} as never, {} as never);
    return { service, created, mail };
  }

  /** Deja correr el envío, que no se espera. */
  const settle = () => new Promise((resolve) => setImmediate(resolve));

  it('envía un código nuevo y dice cuándo se podrá pedir otro', async () => {
    const { service, created, mail } = codeService(null);

    await expect(service.requestVerificationCode('nueva@pesv.test', 'COLOMBIA')).resolves.toMatchObject({
      resendInSeconds: 60,
    });
    await settle();
    expect(created).toHaveLength(1);
    expect(mail.sendVerificationCode).toHaveBeenCalledTimes(1);
  });

  it('con un código enviado hace poco no envía otro, pero deja seguir con el que ya tiene', async () => {
    const { service, created, mail } = codeService({ createdAt: new Date(Date.now() - 20_000) });

    const response = await service.requestVerificationCode('nueva@pesv.test', 'COLOMBIA');

    expect(response.resendInSeconds).toBeGreaterThanOrEqual(39);
    expect(response.resendInSeconds).toBeLessThanOrEqual(40);
    expect(created).toHaveLength(0);
    expect(mail.sendVerificationCode).not.toHaveBeenCalled();
  });

  it('a un correo con cuenta le responde lo mismo, y es su buzón el que recibe cómo entrar', async () => {
    const fresh = codeService(null);
    const registered = codeService(null, null, { firstName: 'Ana', country: 'MEXICO' });

    const forFresh = await fresh.service.requestVerificationCode('nueva@pesv.test', 'COLOMBIA');
    const forRegistered = await registered.service.requestVerificationCode('ana@pesv.test', 'COLOMBIA');
    await settle();

    expect(forRegistered).toEqual(forFresh);
    // Se guarda un código igual: uno equivocado tiene que responder lo mismo que para cualquiera.
    expect(registered.created).toHaveLength(1);
    expect(registered.mail.sendVerificationCode).not.toHaveBeenCalled();
    expect(registered.mail.sendAccountExists).toHaveBeenCalledWith('ana@pesv.test', 'Ana', 'MEXICO');
  });

  it('con una solicitud pendiente responde lo mismo y avisa de ella al buzón, en lugar del código', async () => {
    const { service, mail } = codeService(null, { status: 'PENDING', country: 'COLOMBIA' });

    await expect(service.requestVerificationCode('nueva@pesv.test', 'COLOMBIA')).resolves.toMatchObject({
      resendInSeconds: 60,
    });
    await settle();

    expect(mail.sendVerificationCode).not.toHaveBeenCalled();
    expect(mail.sendAccessRequestPending).toHaveBeenCalledWith('nueva@pesv.test', 'COLOMBIA');
  });

  it('tras un rechazo se puede volver a solicitar', async () => {
    const { service, mail } = codeService(null, { status: 'REJECTED', country: 'COLOMBIA' });

    await service.requestVerificationCode('nueva@pesv.test', 'COLOMBIA');
    await settle();
    expect(mail.sendVerificationCode).toHaveBeenCalledTimes(1);
  });
});
