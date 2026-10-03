import { BadRequestException } from '@nestjs/common';
import { UserService } from './user.service';

/** Versión vigente de la política de datos en todas las pruebas. */
const settings = { legalVersion: async () => '2026-09-25' };

/**
 * Borrar una cuenta.
 *
 * Tiene que llevarse **todo lo de esa persona** —su avance, sus entregas, sus mensajes,
 * sus archivos— y **no tocar lo que creó** como examinador: sus cursos siguen vivos, con
 * sus alumnos dentro, bajo el responsable al que se traspasen.
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
    certificate: { findMany: async () => [{ pdfKey: 'certificados/a.pdf' }] },
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
  const storage = {
    deleteFiles: async (keys: unknown[]) => {
      deleted.files.push(...keys);
    },
  };

  const service = new UserService(prisma as never, storage as never, realtime as never, settings as never);
  jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);

  return { service, order, deleted };
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

    expect(deleted.files).toEqual(
      expect.arrayContaining(['avatars/foto.png', 'firmas/f.png', 'certificados/a.pdf', 'entregas/b.pdf']),
    );
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
    const service = new UserService(prisma as never, {} as never, {} as never, settings as never);
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
    const service = new UserService(prisma as never, {} as never, realtime as never, settings as never);

    await service.updateProfile('usuario-1', { currentPassword: 'ClaveVieja1', newPassword: 'ClaveNueva2' });

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ usesDefaultPassword: false, currentSessionJti: null });
    expect(realtime.revokeSession).toHaveBeenCalledWith('usuario-1', 'password_changed');
  });

  it('si la foto nueva no se puede guardar en la cuenta, se borra del almacenamiento', async () => {
    const prisma = {
      user: {
        findUnique: async () => ({ photoUrl: null, country: 'MEXICO' }),
        update: async () => {
          throw new Error('la base no responde');
        },
      },
    };
    const storage = {
      uploadFromDisk: async () => 'avatars/nueva.png',
      deleteFiles: jest.fn().mockResolvedValue(undefined),
    };
    const service = new UserService(prisma as never, storage as never, {} as never, settings as never);

    await expect(service.uploadProfilePhoto('usuario-1', '/tmp/foto', 'foto.png')).rejects.toThrow();
    expect(storage.deleteFiles).toHaveBeenCalledWith(['avatars/nueva.png']);
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
    return { service: new UserService(prisma as never, {} as never, {} as never, settings as never), updates };
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
