import { createHmac } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { IntegrationWebhooks } from './integration-webhooks';
import { InternalAddressError, NoAnswerError } from './webhook-transport';

/**
 * Avisos al sistema que pidió cada matrícula. Lo que importa: que lleguen firmados, que uno que no
 * llega se reintente sin perderse y que un sistema caído no frene la pasada ni se martillee.
 */

const KEY_HASH = 'a'.repeat(64);
const NOW = Date.parse('2026-10-28T12:00:00Z');

interface ClientRow {
  id: number;
  country: string;
  callbackUrl: string | null;
  keyHash: string | null;
  noticeError: string | null;
  lastNoticeAt?: Date | null;
}

function webhooksWith(clients: ClientRow[], requests: { guid: string; clientId: number; status: string }[]) {
  const rows = requests.map((request) => ({ ...request, notifiedStatus: null, noticeRetryAt: null as Date | null }));
  const prisma = {
    $queryRaw: jest.fn(async () => rows.map(({ guid }) => ({ guid }))),
    externalEnrollment: {
      findUniqueOrThrow: async ({ where }: { where: { guid: string } }) => {
        const row = rows.find((r) => r.guid === where.guid)!;
        return { ...row, client: clients.find((c) => c.id === row.clientId)! };
      },
      update: async ({ where, data }: { where: { guid: string }; data: object }) =>
        Object.assign(rows.find((r) => r.guid === where.guid)!, data),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    integrationClient: {
      findFirst: async ({ where }: { where: { id: number; country: string } }) =>
        clients.find((c) => c.id === where.id && c.country === where.country) ?? null,
      update: async ({ where, data }: { where: { id: number }; data: object }) =>
        Object.assign(clients.find((c) => c.id === where.id)!, data),
    },
  };
  // La solicitud tal como se le contestaría: aquí basta con su estado.
  const views = { request: async ({ guid, status }: { guid: string; status: string }) => ({ id: guid, status }) };
  const realtime = { emitToRole: jest.fn() };
  const webhooks = new IntegrationWebhooks(prisma as never, views as never, realtime as never, { post } as never);
  return { webhooks, rows, clients, realtime, resumed: prisma.externalEnrollment.updateMany };
}

const PESV: ClientRow = {
  id: 1,
  country: 'COLOMBIA',
  callbackUrl: 'https://pesv.example/avisos',
  keyHash: KEY_HASH,
  noticeError: null,
};

/** El transporte (ver `WebhookTransport`): recibe dirección, cabeceras, cuerpo y espera, y da el código. */
const post = jest.fn<Promise<number>, [string, Record<string, string>, string, number]>();

beforeEach(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
  post.mockReset().mockResolvedValue(204);
});
afterEach(() => jest.useRealTimers());

describe('IntegrationWebhooks · avisos pendientes', () => {
  it('envía cada uno firmado con el resumen de la clave y apunta lo que ya sabe el sistema', async () => {
    const { webhooks, rows, clients } = webhooksWith(
      [{ ...PESV }],
      [{ guid: 's-1', clientId: 1, status: 'COMPLETED' }],
    );

    await expect(webhooks.deliverPending()).resolves.toBe(1);

    const [url, headers, body, timeoutMs] = post.mock.calls[0];
    expect(url).toBe('https://pesv.example/avisos');
    expect(timeoutMs).toBe(10_000);
    expect(JSON.parse(body)).toEqual({
      event: 'enrollment-request.updated',
      sentAt: new Date(NOW).toISOString(),
      request: { id: 's-1', status: 'COMPLETED' },
    });
    const timestamp = NOW / 1000;
    const digest = createHmac('sha256', KEY_HASH).update(`${timestamp}.${body}`).digest('hex');
    expect(headers['X-Lms-Signature']).toBe(`t=${timestamp},v1=${digest}`);

    expect(rows[0]).toMatchObject({ notifiedStatus: 'COMPLETED', noticeRetryAt: null });
    expect(clients[0]).toMatchObject({ lastNoticeAt: new Date(NOW), noticeError: null });
  });

  it('si el sistema no contesta, lo reintenta a los 15 minutos y no insiste en la misma pasada', async () => {
    post.mockRejectedValue(new NoAnswerError());
    const { webhooks, rows, clients, realtime } = webhooksWith(
      [{ ...PESV }],
      [
        { guid: 's-1', clientId: 1, status: 'ENROLLED' },
        { guid: 's-2', clientId: 1, status: 'COMPLETED' },
      ],
    );

    await expect(webhooks.deliverPending()).resolves.toBe(0);

    expect(post).toHaveBeenCalledTimes(1);
    expect(rows[0]).toMatchObject({ notifiedStatus: null, noticeRetryAt: new Date(NOW + 15 * 60_000) });
    expect(rows[1]).toMatchObject({ notifiedStatus: null, noticeRetryAt: null });
    expect(clients[0].noticeError).toBe('No respondió en 10 s.');
    // Empezó a fallar: los paneles de la sede lo ven.
    expect(realtime.emitToRole).toHaveBeenCalledWith('integration:changed', {}, 'COLOMBIA', 'ADMIN');
  });

  it('un sistema que falla no frena los avisos a los demás', async () => {
    post.mockImplementation(async (url) => (url.includes('caido') ? 503 : 200));
    const { webhooks, rows } = webhooksWith(
      [
        { ...PESV, callbackUrl: 'https://caido.example/avisos' },
        { ...PESV, id: 2 },
      ],
      [
        { guid: 's-1', clientId: 1, status: 'ENROLLED' },
        { guid: 's-2', clientId: 2, status: 'ENROLLED' },
      ],
    );

    await expect(webhooks.deliverPending()).resolves.toBe(1);
    expect(rows[1].notifiedStatus).toBe('ENROLLED');
  });

  it.each([
    [async () => 500, 'Respondió con el código 500.'],
    [async () => 302, 'La dirección redirige a otra: escribe la definitiva.'],
    [
      async () => {
        throw new Error('getaddrinfo ENOTFOUND pesv.example');
      },
      'No se pudo conectar: getaddrinfo ENOTFOUND pesv.example',
    ],
    [
      async () => {
        throw new InternalAddressError('10.0.0.5');
      },
      'La dirección apunta a una red interna (10.0.0.5). Los avisos sólo van a direcciones públicas.',
    ],
  ])('dice por qué no llegó: %#', async (outcome, reason) => {
    post.mockImplementation(outcome);
    const { webhooks, clients } = webhooksWith([{ ...PESV }], [{ guid: 's-1', clientId: 1, status: 'REJECTED' }]);

    await webhooks.deliverPending();

    expect(clients[0].noticeError).toBe(reason);
  });

  it('si ya fallaba igual, no vuelve a refrescar los paneles; al recuperarse, sí', async () => {
    post.mockResolvedValue(500);
    const { webhooks, realtime } = webhooksWith(
      [{ ...PESV, noticeError: 'Respondió con el código 500.' }],
      [{ guid: 's-1', clientId: 1, status: 'ENROLLED' }],
    );

    await webhooks.deliverPending();
    expect(realtime.emitToRole).not.toHaveBeenCalled();

    post.mockResolvedValue(200);
    await webhooks.deliverPending();
    expect(realtime.emitToRole).toHaveBeenCalledTimes(1);
  });

  it('sin dirección o sin clave no envía nada: el aviso espera a que las tenga', async () => {
    const { webhooks, rows } = webhooksWith(
      [
        { ...PESV, callbackUrl: null },
        { ...PESV, id: 2, keyHash: null },
      ],
      [
        { guid: 's-1', clientId: 1, status: 'ENROLLED' },
        { guid: 's-2', clientId: 2, status: 'ENROLLED' },
      ],
    );

    await expect(webhooks.deliverPending()).resolves.toBe(0);
    expect(post).not.toHaveBeenCalled();
    expect(rows.map((row) => row.notifiedStatus)).toEqual([null, null]);
  });
});

describe('IntegrationWebhooks · aviso de prueba', () => {
  it('si llega, lo dice y los avisos que esperaban un reintento salen en la pasada siguiente', async () => {
    const { webhooks, clients, resumed } = webhooksWith([{ ...PESV, noticeError: 'Respondió con el código 500.' }], []);

    await expect(webhooks.ping(1, 'COLOMBIA')).resolves.toEqual({
      delivered: true,
      message: 'El sistema recibió el aviso de prueba.',
    });
    expect(JSON.parse(post.mock.calls[0][2])).toEqual({
      event: 'ping',
      sentAt: new Date(NOW).toISOString(),
    });
    expect(clients[0].noticeError).toBeNull();
    expect(resumed).toHaveBeenCalledWith({
      where: { clientId: 1, noticeRetryAt: { not: null } },
      data: { noticeRetryAt: null },
    });
  });

  it('si no llega, dice por qué sin tratarlo como un error del campus', async () => {
    post.mockResolvedValue(404);
    const { webhooks, clients, resumed } = webhooksWith([{ ...PESV }], []);

    await expect(webhooks.ping(1, 'COLOMBIA')).resolves.toEqual({
      delivered: false,
      message: 'El aviso de prueba no llegó. Respondió con el código 404.',
    });
    expect(clients[0].noticeError).toBe('Respondió con el código 404.');
    expect(resumed).not.toHaveBeenCalled();
  });

  it('necesita una dirección y una clave vigente, y un sistema de la sede', async () => {
    const { webhooks } = webhooksWith(
      [
        { ...PESV, callbackUrl: null },
        { ...PESV, id: 2, keyHash: null },
      ],
      [],
    );

    await expect(webhooks.ping(1, 'COLOMBIA')).rejects.toBeInstanceOf(ConflictException);
    await expect(webhooks.ping(2, 'COLOMBIA')).rejects.toBeInstanceOf(ConflictException);
    await expect(webhooks.ping(2, 'MEXICO')).rejects.toBeInstanceOf(NotFoundException);
    expect(post).not.toHaveBeenCalled();
  });
});
