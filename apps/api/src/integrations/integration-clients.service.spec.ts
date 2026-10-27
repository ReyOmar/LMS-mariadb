import { NotFoundException } from '@nestjs/common';
import { IntegrationClientsService } from './integration-clients.service';
import { hashKey } from './integration-key';

/** Las claves dan acceso a matricular en una sede: se guardan resumidas y se pueden retirar al momento. */
describe('IntegrationClientsService', () => {
  function serviceWith() {
    const clients: Record<string, unknown>[] = [];
    const prisma = {
      integrationClient: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: clients.length + 1, lastUsedAt: null, ...data };
          clients.push(row);
          return row;
        },
        findFirst: async ({ where }: { where: { id: number; country: string } }) =>
          clients.find((c) => c.id === where.id && c.country === where.country) ?? null,
        findUnique: async ({ where }: { where: { keyHash: string } }) =>
          clients.find((c) => c.keyHash === where.keyHash) ?? null,
        update: jest.fn(async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) =>
          Object.assign(clients.find((c) => c.id === where.id)!, data),
        ),
      },
    };
    const service = new IntegrationClientsService(prisma as never);
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
    return { service, clients, update: prisma.integrationClient.update };
  }

  it('al conectar un sistema la clave se entrega una vez y sólo se guarda su resumen', async () => {
    const { service, clients } = serviceWith();

    const { key } = await service.create('Software PESV', 'COLOMBIA');

    expect(clients[0]).toMatchObject({ keyHash: hashKey(key), keyPrefix: key.slice(0, 12), country: 'COLOMBIA' });
    expect(JSON.stringify(clients[0])).not.toContain(key);
    await expect(service.authenticate(key)).resolves.toEqual({ id: 1, name: 'Software PESV', country: 'COLOMBIA' });
  });

  it('renovar la clave deja sin valor la anterior', async () => {
    const { service } = serviceWith();
    const { key: old } = await service.create('Software PESV', 'COLOMBIA');

    const { key } = await service.renewKey(1, 'COLOMBIA');

    await expect(service.authenticate(old)).resolves.toBeNull();
    await expect(service.authenticate(key)).resolves.not.toBeNull();
  });

  it('revocar desconecta el sistema sin borrarlo', async () => {
    const { service, clients } = serviceWith();
    const { key } = await service.create('Software PESV', 'COLOMBIA');

    await service.revokeKey(1, 'COLOMBIA');

    await expect(service.authenticate(key)).resolves.toBeNull();
    expect(clients[0]).toMatchObject({ name: 'Software PESV', keyHash: null, keyPrefix: null });
  });

  it('un administrador no toca los sistemas de la otra sede', async () => {
    const { service } = serviceWith();
    await service.create('Software PESV', 'COLOMBIA');

    await expect(service.renewKey(1, 'MEXICO')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.revokeKey(1, 'MEXICO')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('el último uso se apunta, pero no en cada petición', async () => {
    const { service, update } = serviceWith();
    const { key } = await service.create('Software PESV', 'COLOMBIA');

    await service.authenticate(key);
    await service.authenticate(key);

    expect(update).toHaveBeenCalledTimes(1);
  });
});
