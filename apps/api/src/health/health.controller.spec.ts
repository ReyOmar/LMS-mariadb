import { HealthController } from './health.controller';

/** Lo que ve la supervisión del alojamiento: si la base responde y si se pueden guardar archivos. */
describe('HealthController', () => {
  function controllerWith({ databaseUp = true, storageWritable = true } = {}) {
    const prisma = {
      $queryRaw: async () => {
        if (!databaseUp) throw new Error('la base no responde');
        return [{ 1: 1 }];
      },
    };
    const storage = { isWritable: async () => storageWritable };
    return new HealthController(prisma as never, storage as never);
  }

  it('con base y almacenamiento disponibles está sano', async () => {
    expect(await controllerWith().check()).toMatchObject({
      status: 'healthy',
      database: { status: 'ok' },
      storage: { status: 'ok' },
    });
  });

  it('si no se puede escribir en el almacenamiento queda degradado y dice por qué', async () => {
    expect(await controllerWith({ storageWritable: false }).check()).toMatchObject({
      status: 'degraded',
      database: { status: 'ok' },
      storage: { status: 'error' },
    });
  });

  it('si la base no responde queda degradado sin latencia', async () => {
    expect(await controllerWith({ databaseUp: false }).check()).toMatchObject({
      status: 'degraded',
      database: { status: 'error', latencyMs: null },
    });
  });
});
