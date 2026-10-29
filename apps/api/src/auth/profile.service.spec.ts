import { ProfileService } from './profile.service';
import { fileOwnershipDouble } from '../common/testing/file-ownership-double';

/** Versión vigente de la política de datos en todas las pruebas. */
const settings = { legalVersion: async () => '2026-09-25' };

describe('ProfileService · perfil propio', () => {
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
    const service = new ProfileService(prisma as never, {} as never, realtime as never, settings as never, {} as never);

    await service.update('usuario-1', { currentPassword: 'ClaveVieja1', newPassword: 'ClaveNueva2!' });

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ usesDefaultPassword: false, currentSessionJti: null });
    expect(realtime.revokeSession).toHaveBeenCalledWith('usuario-1', 'password_changed');
  });
});

describe('ProfileService · foto de perfil', () => {
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
    const service = new ProfileService(
      prisma as never,
      storage as never,
      realtime as never,
      settings as never,
      files.files,
    );
    return { service, storage, realtime, files, updates };
  }

  it('anota la foto a nombre de su dueño y retira la que tenía al guardarla', async () => {
    const { service, storage, files, updates } = photoService('avatars/vieja.png');

    await service.uploadPhoto('usuario-1', '/tmp/foto', 'foto.png');

    expect(storage.uploadFromDisk).toHaveBeenCalledWith('/tmp/foto', 'foto.png', 'avatars', {
      sub: 'usuario-1',
      country: 'MEXICO',
    });
    expect(updates).toEqual([{ photoUrl: 'avatars/nueva.png' }]);
    expect(files.retired()).toEqual(['avatars/vieja.png']);
  });

  it('si la foto nueva no se puede guardar en la cuenta, se borra del almacenamiento', async () => {
    const { service, files } = photoService(null, { failUpdate: true });

    await expect(service.uploadPhoto('usuario-1', '/tmp/foto', 'foto.png')).rejects.toThrow('la base no responde');
    expect(files.discarded).toHaveBeenCalledWith(['avatars/nueva.png']);
    expect(files.retired()).toEqual([]);
  });

  it('quitar la foto la retira del almacenamiento y la cuenta deja de mostrarla', async () => {
    const { service, files, updates } = photoService('avatars/vieja.png');

    await service.deletePhoto('usuario-1');

    expect(updates).toEqual([{ photoUrl: null }]);
    expect(files.retired()).toEqual(['avatars/vieja.png']);
  });

  it('avisa a los administradores de la sede, cuya lista de cuentas enseña la foto', async () => {
    const { service, realtime } = photoService('avatars/vieja.png');

    await service.uploadPhoto('usuario-1', '/tmp/foto', 'foto.png');
    await service.deletePhoto('usuario-1');

    expect(realtime.emitToRole.mock.calls).toEqual([
      ['user:updated', { guid: 'usuario-1' }, 'MEXICO', 'ADMIN'],
      ['user:updated', { guid: 'usuario-1' }, 'MEXICO', 'ADMIN'],
    ]);
  });
});

describe('ProfileService · autorización de tratamiento de datos', () => {
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
      service: new ProfileService(prisma as never, {} as never, {} as never, settings as never, {} as never),
      updates,
    };
  }

  it('pide aceptar la política a quien no la aceptó o aceptó una versión anterior', async () => {
    expect((await serviceWith(null).service.get('u1', 'COLOMBIA')).consentRequired).toBe(true);
    expect((await serviceWith('2025-01-01').service.get('u1', 'COLOMBIA')).consentRequired).toBe(true);
  });

  it('no la vuelve a pedir si aceptó la versión vigente, y no expone la versión', async () => {
    const profile = await serviceWith('2026-09-25').service.get('u1', 'COLOMBIA');
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
