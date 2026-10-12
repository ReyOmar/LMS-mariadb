import { BadRequestException } from '@nestjs/common';
import { UserService } from './user.service';
import { fileOwnershipDouble } from '../common/testing/file-ownership-double';

/** Versión vigente de la política de datos en todas las pruebas. */
const settings = { legalVersion: async () => '2026-09-25' };

/**
 * Borrar una cuenta.
 *
 * Tiene que llevarse **todo lo de esa persona** —su avance, sus entregas, sus mensajes,
 * sus archivos— y **no tocar lo que creó** como examinador: sus cursos siguen vivos, con
 * sus alumnos dentro, bajo el responsable al que se traspasen. Sus certificados tampoco se
 * tocan: acreditan una formación que ocurrió y se siguen verificando.
 *
 * Lo que se fija aquí son las tres decisiones del servicio; que las filas relacionadas
 * caigan es cosa de las claves ajenas en cascada, y eso se comprueba contra la base.
 */

const GUID = 'alumno-1';
const ADMIN = 'admin-1';
const EMAIL = 'alumno@pesv.test';

interface Scenario {
  taughtCourses?: number;
  photo?: string | null;
  signature?: string | null;
}

function createService({ taughtCourses = 0, photo = 'avatars/foto.png', signature = null }: Scenario = {}) {
  const order: string[] = [];
  const deleted: { emails: string[]; files: unknown[] } = { emails: [], files: [] };
  const certificateOperations: string[] = [];

  const prisma = {
    user: {
      findFirst: async () => ({
        guid: GUID,
        email: EMAIL,
        role: 'STUDENT',
        photoUrl: photo,
        signatureUrl: signature,
        _count: { taughtCourses },
      }),
      findMany: async () => [],
      delete: async () => {
        order.push('borrar usuario');
        return {};
      },
      updateMany: async () => ({ count: taughtCourses }),
    },
    certificate: Object.fromEntries(
      ['findMany', 'update', 'updateMany', 'delete', 'deleteMany'].map((operation) => [
        operation,
        async () => {
          certificateOperations.push(operation);
          return operation === 'findMany' ? [{ pdfKey: 'certificados/a.pdf' }] : { count: 1 };
        },
      ]),
    ),
    submission: { findMany: async () => [{ attachmentKey: 'entregas/b.pdf' }] },
    passwordReset: {
      deleteMany: async ({ where }: { where: { email: string } }) => {
        deleted.emails.push(`reset:${where.email}`);
        return { count: 1 };
      },
    },
    emailVerification: {
      deleteMany: async ({ where }: { where: { email: string } }) => {
        deleted.emails.push(`verificacion:${where.email}`);
        return { count: 1 };
      },
    },
    course: {
      updateMany: async () => {
        order.push('traspasar cursos');
        return { count: taughtCourses };
      },
    },
    $transaction: async (operations: Promise<unknown>[]) => {
      order.push(`transacción de ${operations.length}`);
      return Promise.all(operations);
    },
  };

  const realtime = { revokeSession: () => undefined, emitToRole: () => undefined };
  const files = {
    deleteUnreferenced: async (keys: unknown[]) => {
      deleted.files.push(...keys);
    },
  };

  const service = new UserService(
    prisma as never,
    {} as never,
    realtime as never,
    settings as never,
    {} as never,
    files as never,
  );
  jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);

  return { service, order, deleted, certificateOperations };
}

describe('UserService · borrar una cuenta', () => {
  it('no deja borrarse a uno mismo', async () => {
    const { service } = createService();

    await expect(service.deleteUser(ADMIN, 'COLOMBIA', ADMIN)).rejects.toThrow(BadRequestException);
  });

  it('traspasa sus cursos en la misma transacción que lo borra', async () => {
    // Fuera de ella, si el borrado fallara los cursos ya habrían cambiado de dueño.
    const { service, order } = createService({ taughtCourses: 2 });

    await service.deleteUser(GUID, 'COLOMBIA', ADMIN, 'otro-examinador');

    // Traspaso, dos limpiezas de secretos y el borrado: cuatro operaciones, una transacción.
    expect(order).toContain('transacción de 4');
    expect(order.indexOf('traspasar cursos')).toBeLessThan(order.indexOf('borrar usuario'));
  });

  it('se lleva los secretos pendientes de su correo', async () => {
    // Un enlace de recuperación se resuelve por correo: si la cuenta se borra y alguien
    // registra ese mismo correo, un enlace antiguo abriría la cuenta nueva.
    const { service, deleted } = createService();

    await service.deleteUser(GUID, 'COLOMBIA', ADMIN);

    expect(deleted.emails).toEqual([`reset:${EMAIL}`, `verificacion:${EMAIL}`]);
  });

  it('borra sus archivos del almacenamiento', async () => {
    const { service, deleted } = createService({ photo: 'avatars/foto.png', signature: 'firmas/f.png' });

    await service.deleteUser(GUID, 'COLOMBIA', ADMIN);

    expect(deleted.files).toEqual(expect.arrayContaining(['avatars/foto.png', 'firmas/f.png', 'entregas/b.pdf']));
  });

  it('conserva sus certificados y sus PDF', async () => {
    // La fila queda sin cuenta enlazada (SetNull en la base) y se verifica con el nombre
    // del titular guardado en ella; el servicio no la toca ni borra su archivo.
    const { service, deleted, certificateOperations } = createService();

    await service.deleteUser(GUID, 'COLOMBIA', ADMIN);

    expect(certificateOperations).toEqual([]);
    expect(deleted.files).not.toContain('certificados/a.pdf');
  });

  it('exige decir a quién pasan los cursos de quien imparte alguno', async () => {
    // Sus cursos no se borran con él: tienen alumnos dentro y contenido que sigue sirviendo.
    const { service } = createService({ taughtCourses: 2 });

    await expect(service.deleteUser(GUID, 'COLOMBIA', ADMIN)).rejects.toThrow(/curso/i);
  });
});

/**
 * Listado de cuentas.
 *
 * Lo que se fija aquí es que el recorte y el filtro los decida el servicio —no el
 * navegador sobre la sede entera—, y sobre todo que **nunca** se pueda pedir la sede de al
 * lado.
 */
describe('UserService — listado de cuentas', () => {
  /** Una cuenta cualquiera, con lo justo para que el listado la pueda formatear. */
  function account(n: number) {
    return { guid: `guid-${n}`, createdAt: new Date(2026, 0, 1, 0, n) };
  }

  /** Grupo de `groupBy` por clave, como lo devuelve Prisma. */
  type Group = Record<string, unknown> & { _count: { _all: number } };

  function recordingService(
    totalCount = 0,
    { roles = [], taught = [], enrolled = [] }: { roles?: Group[]; taught?: Group[]; enrolled?: Group[] } = {},
  ) {
    const queries: { where?: unknown; take?: number; skip?: number; orderBy?: unknown }[] = [];
    const pageCounts: { model: string; where: unknown }[] = [];
    let counts = 0;
    const prisma = {
      user: {
        findMany: async (query: { where?: unknown; take?: number }) => {
          queries.push(query);
          return Array.from({ length: Math.min(totalCount, query.take ?? 0) }, (_, i) => account(i));
        },
        groupBy: async () => {
          counts++;
          return roles;
        },
        count: async () => {
          counts++;
          return 2071;
        },
      },
      course: {
        groupBy: async ({ where }: { where: unknown }) => {
          pageCounts.push({ model: 'course', where });
          return taught;
        },
      },
      enrollment: {
        groupBy: async ({ where }: { where: unknown }) => {
          pageCounts.push({ model: 'enrollment', where });
          return enrolled;
        },
      },
    };
    const service = new UserService(
      prisma as never,
      {} as never,
      {} as never,
      settings as never,
      {} as never,
      {} as never,
    );
    return { service, queries, pageCounts, counts: () => counts };
  }

  const ROLES_500: Group[] = [
    { role: 'ADMIN', _count: { _all: 3 } },
    { role: 'TEACHER', _count: { _all: 17 } },
    { role: 'STUDENT', _count: { _all: 480 } },
  ];

  it('acota siempre por la sede de quien pregunta', async () => {
    const { service, queries } = recordingService();
    await service.getUsers('COLOMBIA');

    expect(queries[0].where).toMatchObject({ country: 'COLOMBIA' });
  });

  it('trae una página, no la sede entera', async () => {
    const { service, queries } = recordingService(500);
    const { users } = await service.getUsers('COLOMBIA');

    expect(users).toHaveLength(50);
    // Pide una de más para saber si queda algo, pero no la entrega.
    expect(queries[0].take).toBe(51);
  });

  it('no deja pedir una página desmedida aunque la petición lo intente', async () => {
    const { service } = recordingService(100_000);
    const { users } = await service.getUsers('COLOMBIA', { limit: 100000 });

    expect(users).toHaveLength(200);
  });

  it('filtra por rol cuando la pantalla lo pide', async () => {
    const { service, queries } = recordingService();
    await service.getUsers('MEXICO', { role: 'TEACHER' });

    expect(queries[0].where).toMatchObject({ country: 'MEXICO', role: 'TEACHER' });
  });

  it('busca por nombre, apellido y correo a la vez', async () => {
    const { service, queries } = recordingService();
    await service.getUsers('COLOMBIA', { search: '  ana  ' });

    const where = queries[0].where as { OR?: unknown[] };
    expect(where.OR).toHaveLength(3);
    expect(JSON.stringify(where.OR)).toContain('"ana"');
  });

  it('una búsqueda vacía no añade condiciones', async () => {
    const { service, queries } = recordingService();
    await service.getUsers('COLOMBIA', { search: '   ' });

    expect(queries[0].where).not.toHaveProperty('OR');
  });

  it('ordena por fecha y desempata por identificador', async () => {
    // Sin el desempate, dos altas del mismo milisegundo podrían repetirse o perderse al
    // pasar de página, porque la base es libre de devolverlas en cualquier orden.
    const { service, queries } = recordingService();
    await service.getUsers('COLOMBIA');

    expect(queries[0].orderBy).toEqual([{ createdAt: 'desc' }, { guid: 'desc' }]);
  });

  it('entrega una marca cuando quedan cuentas por traer', async () => {
    const { service } = recordingService(500);
    const { cursor } = await service.getUsers('COLOMBIA');

    expect(cursor).toEqual(expect.any(String));
  });

  it('no entrega marca en la última página, que es como la pantalla sabe que ya está', async () => {
    const { service } = recordingService(30);
    const { cursor } = await service.getUsers('COLOMBIA');

    expect(cursor).toBeNull();
  });

  it('sigue por donde iba sin saltar filas', async () => {
    const { service } = recordingService(500);
    const first = await service.getUsers('COLOMBIA');
    const { service: other, queries } = recordingService(500);
    await other.getUsers('COLOMBIA', { cursor: first.cursor! });

    const where = queries[0].where as { AND?: unknown[] };
    expect(where.AND).toHaveLength(2);
    expect(JSON.stringify(where.AND)).toContain('"lt"');
    expect(queries[0]).not.toHaveProperty('skip');
  });

  it('la búsqueda sobrevive al pasar de página', async () => {
    // Escritas las dos como `OR` al mismo nivel, la marca pisaría a la búsqueda y el
    // listado devolvería cuentas que no coinciden con lo tecleado.
    const { service } = recordingService(500);
    const first = await service.getUsers('COLOMBIA', { search: 'ana' });
    const { service: other, queries } = recordingService(500);
    await other.getUsers('COLOMBIA', { search: 'ana', cursor: first.cursor! });

    expect(JSON.stringify(queries[0].where)).toContain('"ana"');
  });

  it('cuenta la sede sólo en la primera página, con una sola consulta', async () => {
    const { service, counts } = recordingService(500, { roles: ROLES_500 });
    const first = await service.getUsers('COLOMBIA');
    expect(counts()).toBe(1); // las pestañas; el total sale de ellas
    expect(first.total).toBe(500);

    const { service: other, counts: nextCounts } = recordingService(500, { roles: ROLES_500 });
    const second = await other.getUsers('COLOMBIA', { cursor: first.cursor! });

    expect(nextCounts()).toBe(0);
    expect(second).not.toHaveProperty('total');
  });

  it('el total de una pestaña es el número de esa pestaña', async () => {
    const { service } = recordingService(17, { roles: ROLES_500 });
    const result = await service.getUsers('COLOMBIA', { role: 'TEACHER' });

    expect(result.total).toBe(17);
    expect(result.byRole).toEqual({ ADMIN: 3, TEACHER: 17, STUDENT: 480 });
  });

  it('sin búsqueda, las cuentas de la sede salen de las pestañas sin volver a contarla', async () => {
    const { service, counts } = recordingService(50, { roles: ROLES_500 });
    const result = await service.getUsers('COLOMBIA', { role: 'TEACHER' });

    expect(result.registered).toBe(500);
    expect(counts()).toBe(1);
  });

  it('con una búsqueda, las cuentas de la sede no dependen de lo que se busca', async () => {
    const { service } = recordingService(3, { roles: [{ role: 'STUDENT', _count: { _all: 3 } }] });
    const result = await service.getUsers('COLOMBIA', { search: 'ana' });

    expect(result.total).toBe(3);
    expect(result.registered).toBe(2071);
  });

  it('una pestaña sin cuentas cuenta cero, no desaparece', async () => {
    const { service } = recordingService(0, { roles: [{ role: 'STUDENT', _count: { _all: 4 } }] });
    const result = await service.getUsers('COLOMBIA', { role: 'ADMIN' });

    expect(result.total).toBe(0);
    expect(result.byRole).toEqual({ ADMIN: 0, TEACHER: 0, STUDENT: 4 });
  });

  it('cuenta cursos y matrículas sólo de las cuentas de la página', async () => {
    // Contados desde el listado, Prisma agrupaba las tablas enteras en cada página.
    const { service, pageCounts } = recordingService(3);
    await service.getUsers('COLOMBIA');

    const guids = ['guid-0', 'guid-1', 'guid-2'];
    expect(pageCounts).toEqual(
      expect.arrayContaining([
        { model: 'course', where: { teacherGuid: { in: guids } } },
        { model: 'enrollment', where: { userGuid: { in: guids } } },
      ]),
    );
  });

  it('entrega los recuentos de cada cuenta y cero a quien no tiene', async () => {
    const { service } = recordingService(3, {
      taught: [{ teacherGuid: 'guid-1', _count: { _all: 2 } }],
      enrolled: [
        { userGuid: 'guid-0', _count: { _all: 3 } },
        { userGuid: 'guid-2', _count: { _all: 1 } },
      ],
    });
    const { users } = await service.getUsers('COLOMBIA');

    expect(users.map(({ guid, taughtCourses, enrollments }) => ({ guid, taughtCourses, enrollments }))).toEqual([
      { guid: 'guid-0', taughtCourses: 0, enrollments: 3 },
      { guid: 'guid-1', taughtCourses: 2, enrollments: 0 },
      { guid: 'guid-2', taughtCourses: 0, enrollments: 1 },
    ]);
  });

  it('una página vacía no pide recuentos', async () => {
    const { service, pageCounts } = recordingService(0);
    const { users } = await service.getUsers('COLOMBIA', { search: 'nadie' });

    expect(users).toEqual([]);
    expect(pageCounts).toEqual([]);
  });

  it('una marca rota devuelve la primera página en vez de dejar la pantalla en blanco', async () => {
    const { service, queries } = recordingService(500);
    await service.getUsers('COLOMBIA', { cursor: 'esto-no-es-una-marca' });

    expect(queries[0].where).not.toHaveProperty('AND');
  });
});

describe('UserService · perfil propio', () => {
  it('cambiar la contraseña cierra la sesión en la misma escritura que guarda la clave', async () => {
    const { hashPassword } = await import('../common/domain/password');
    const updates: Record<string, unknown>[] = [];
    const prisma = {
      user: {
        findUnique: async () => ({ password: await hashPassword('ClaveVieja1') }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          return { country: 'COLOMBIA' };
        },
      },
    };
    const realtime = { revokeSession: jest.fn(), emitToRole: () => undefined };
    const service = new UserService(
      prisma as never,
      {} as never,
      realtime as never,
      settings as never,
      {} as never,
      {} as never,
    );

    await service.updateProfile('usuario-1', { currentPassword: 'ClaveVieja1', newPassword: 'ClaveNueva2' });

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ usesDefaultPassword: false, currentSessionJti: null });
    expect(realtime.revokeSession).toHaveBeenCalledWith('usuario-1', 'password_changed');
  });
});

describe('UserService · foto de perfil', () => {
  /** Cuenta con foto `current`; la fila se bloquea y se reescribe dentro de una transacción. */
  function photoService(current: string | null, { failUpdate = false } = {}) {
    const updates: Record<string, unknown>[] = [];
    const tx = {
      $queryRaw: async () => [{ photoUrl: current }],
      user: {
        update: async ({ data }: { data: Record<string, unknown> }) => {
          if (failUpdate) throw new Error('la base no responde');
          updates.push(data);
        },
      },
    };
    const prisma = {
      user: {
        findUnique: async () => ({ photoUrl: current, country: 'MEXICO' }),
        update: tx.user.update,
      },
      $transaction: async <T>(work: (client: typeof tx) => Promise<T>) => work(tx),
    };
    const storage = { uploadFromDisk: jest.fn().mockResolvedValue('avatars/nueva.png') };
    const realtime = { emitToRole: jest.fn() };
    const files = fileOwnershipDouble();
    const service = new UserService(
      prisma as never,
      storage as never,
      realtime as never,
      settings as never,
      {} as never,
      files.files,
    );
    return { service, storage, realtime, files, updates };
  }

  it('anota la foto a nombre de su dueño y retira la que tenía al guardarla', async () => {
    const { service, storage, files, updates } = photoService('avatars/vieja.png');

    await service.uploadProfilePhoto('usuario-1', '/tmp/foto', 'foto.png');

    expect(storage.uploadFromDisk).toHaveBeenCalledWith('/tmp/foto', 'foto.png', 'avatars', {
      sub: 'usuario-1',
      country: 'MEXICO',
    });
    expect(updates).toEqual([{ photoUrl: 'avatars/nueva.png' }]);
    expect(files.retired()).toEqual(['avatars/vieja.png']);
  });

  it('si la foto nueva no se puede guardar en la cuenta, se borra del almacenamiento', async () => {
    const { service, files } = photoService(null, { failUpdate: true });

    await expect(service.uploadProfilePhoto('usuario-1', '/tmp/foto', 'foto.png')).rejects.toThrow(
      'la base no responde',
    );
    expect(files.discarded).toHaveBeenCalledWith(['avatars/nueva.png']);
    expect(files.retired()).toEqual([]);
  });

  it('quitar la foto la retira del almacenamiento y la cuenta deja de mostrarla', async () => {
    const { service, files, updates } = photoService('avatars/vieja.png');

    await service.deleteProfilePhoto('usuario-1');

    expect(updates).toEqual([{ photoUrl: null }]);
    expect(files.retired()).toEqual(['avatars/vieja.png']);
  });

  it('avisa a los administradores de la sede, cuya lista de cuentas enseña la foto', async () => {
    const { service, realtime } = photoService('avatars/vieja.png');

    await service.uploadProfilePhoto('usuario-1', '/tmp/foto', 'foto.png');
    await service.deleteProfilePhoto('usuario-1');

    expect(realtime.emitToRole.mock.calls).toEqual([
      ['user:updated', { guid: 'usuario-1' }, 'MEXICO', 'ADMIN'],
      ['user:updated', { guid: 'usuario-1' }, 'MEXICO', 'ADMIN'],
    ]);
  });
});

describe('UserService · autorización de tratamiento de datos', () => {
  const profileRow = { guid: 'u1', email: 'a@x', firstName: 'Ana', lastName: 'Ruiz', role: 'STUDENT' };

  function serviceWith(dataConsentVersion: string | null) {
    const updates: unknown[] = [];
    const prisma = {
      user: {
        findFirst: async () => ({ ...profileRow, dataConsentVersion }),
        update: async (args: unknown) => updates.push(args),
      },
    };
    return {
      service: new UserService(prisma as never, {} as never, {} as never, settings as never, {} as never, {} as never),
      updates,
    };
  }

  it('pide aceptar la política a quien no la aceptó o aceptó una versión anterior', async () => {
    expect((await serviceWith(null).service.getUserProfile('u1', 'COLOMBIA')).consentRequired).toBe(true);
    expect((await serviceWith('2025-01-01').service.getUserProfile('u1', 'COLOMBIA')).consentRequired).toBe(true);
  });

  it('no la vuelve a pedir si aceptó la versión vigente, y no expone la versión', async () => {
    const profile = await serviceWith('2026-09-25').service.getUserProfile('u1', 'COLOMBIA');
    expect(profile.consentRequired).toBe(false);
    expect(profile).not.toHaveProperty('dataConsentVersion');
  });

  it('al aceptar guarda la fecha y la versión vigente como prueba', async () => {
    const { service, updates } = serviceWith(null);
    await service.acceptDataPolicy('u1', 'COLOMBIA');
    expect(updates[0]).toMatchObject({
      where: { guid: 'u1' },
      data: { dataConsentVersion: '2026-09-25', dataConsentAt: expect.any(Date) },
    });
  });
});

describe('UserService · alta desde el panel', () => {
  function creationService() {
    const created: Record<string, unknown>[] = [];
    const welcome: { email: string; password: string; country: string }[] = [];
    const prisma = {
      user: {
        findUnique: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return { guid: 'nueva-1', email: data.email, firstName: data.firstName };
        },
      },
    };
    const mail = {
      sendWelcome: async (email: string, _name: string, password: string, country: string) => {
        welcome.push({ email, password, country });
        return true;
      },
    };
    const realtime = { emitToRole: () => undefined };
    const service = new UserService(
      prisma as never,
      {} as never,
      realtime as never,
      settings as never,
      mail as never,
      {} as never,
    );
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
    return { service, created, welcome };
  }

  const DTO = { firstName: 'Eva', lastName: 'Mora', email: 'eva@pesv.test', role: 'TEACHER' as const };

  it('genera la contraseña temporal en el servidor y se la envía por correo a la persona', async () => {
    const { service, created, welcome } = creationService();

    await service.createUser(DTO, 'MEXICO');

    expect(welcome).toEqual([{ email: 'eva@pesv.test', password: expect.any(String), country: 'MEXICO' }]);
    // Se guarda cifrada y la cuenta queda obligada a cambiarla al entrar.
    expect(created[0].password).not.toBe(welcome[0].password);
    expect(created[0]).toMatchObject({ role: 'TEACHER', country: 'MEXICO', usesDefaultPassword: true });
  });

  it('cada cuenta recibe una contraseña distinta', async () => {
    const first = creationService();
    const second = creationService();
    await first.service.createUser(DTO, 'COLOMBIA');
    await second.service.createUser(DTO, 'COLOMBIA');

    expect(first.welcome[0].password).not.toBe(second.welcome[0].password);
  });

  it('no devuelve la contraseña temporal en la respuesta', async () => {
    const { service, welcome } = creationService();

    const result = await service.createUser(DTO, 'COLOMBIA');

    expect(JSON.stringify(result)).not.toContain(welcome[0].password);
  });
});

describe('UserService · editar una cuenta', () => {
  const ADMIN_GUID = 'admin-1';

  function editionService(account: { role: string; taughtCourses?: number } | null) {
    const updates: Record<string, unknown>[] = [];
    const lookups: unknown[] = [];
    const prisma = {
      user: {
        findFirst: async (query: unknown) => {
          lookups.push(query);
          return account && { role: account.role, _count: { taughtCourses: account.taughtCourses ?? 0 } };
        },
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          return { guid: 'cuenta-1', ...data };
        },
      },
    };
    const realtime = { revokeSession: jest.fn(), emitToRole: jest.fn() };
    const service = new UserService(
      prisma as never,
      {} as never,
      realtime as never,
      settings as never,
      {} as never,
      {} as never,
    );
    return { service, updates, lookups, realtime };
  }

  it('sólo encuentra cuentas de la sede de quien edita', async () => {
    const { service, lookups } = editionService(null);

    await expect(service.updateUser('cuenta-1', 'MEXICO', ADMIN_GUID, { firstName: 'Ana' })).rejects.toThrow(
      /no encontrado/i,
    );
    expect(lookups[0]).toMatchObject({ where: { guid: 'cuenta-1', country: 'MEXICO' } });
  });

  it('cambiar el nombre no cierra la sesión de la persona', async () => {
    const { service, updates, realtime } = editionService({ role: 'STUDENT' });

    await service.updateUser('cuenta-1', 'COLOMBIA', ADMIN_GUID, { firstName: 'Ana', lastName: 'Ruiz' });

    expect(updates[0]).toEqual({ firstName: 'Ana', lastName: 'Ruiz' });
    expect(realtime.revokeSession).not.toHaveBeenCalled();
  });

  it('cambiar el rol cierra la sesión en la misma escritura y avisa a su dispositivo', async () => {
    const { service, updates, realtime } = editionService({ role: 'STUDENT' });

    await service.updateUser('cuenta-1', 'COLOMBIA', ADMIN_GUID, { role: 'TEACHER' });

    expect(updates[0]).toEqual({ role: 'TEACHER', currentSessionJti: null });
    expect(realtime.revokeSession).toHaveBeenCalledWith('cuenta-1', 'role_changed');
  });

  it('elegir el mismo rol que ya tiene no cuenta como cambio', async () => {
    const { service, realtime } = editionService({ role: 'TEACHER' });

    await expect(service.updateUser('cuenta-1', 'COLOMBIA', ADMIN_GUID, { role: 'TEACHER' })).rejects.toThrow(
      /ningún cambio/i,
    );
    expect(realtime.revokeSession).not.toHaveBeenCalled();
  });

  it('nadie puede cambiar su propio rol, y así la sede nunca se queda sin administradores', async () => {
    const { service, updates } = editionService({ role: 'ADMIN' });

    await expect(service.updateUser(ADMIN_GUID, 'COLOMBIA', ADMIN_GUID, { role: 'STUDENT' })).rejects.toThrow(
      BadRequestException,
    );
    expect(updates).toHaveLength(0);
  });

  it('sí puede cambiar su propio nombre', async () => {
    const { service, updates } = editionService({ role: 'ADMIN' });

    await service.updateUser(ADMIN_GUID, 'COLOMBIA', ADMIN_GUID, { firstName: 'Nuevo' });

    expect(updates[0]).toEqual({ firstName: 'Nuevo' });
  });

  it('un examinador con cursos no pasa a estudiante sin traspasarlos antes', async () => {
    const { service, updates } = editionService({ role: 'TEACHER', taughtCourses: 3 });

    await expect(service.updateUser('cuenta-1', 'COLOMBIA', ADMIN_GUID, { role: 'STUDENT' })).rejects.toThrow(
      /3 curso/,
    );
    expect(updates).toHaveLength(0);
  });

  it('un examinador con cursos sí puede pasar a administrador, que también puede tenerlos', async () => {
    const { service, updates } = editionService({ role: 'TEACHER', taughtCourses: 3 });

    await service.updateUser('cuenta-1', 'COLOMBIA', ADMIN_GUID, { role: 'ADMIN' });

    expect(updates[0]).toMatchObject({ role: 'ADMIN' });
  });
});
