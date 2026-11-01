import { createServer, type Server, type Socket } from 'node:net';
import { InternalAddressError, isInternalAddress, NoAnswerError, WebhookTransport } from './webhook-transport';

/**
 * Por dónde salen los avisos a los otros sistemas. Lo que importa: que nunca lleguen a la red interna
 * —ni por un nombre que resuelve a ella ni por una IP escrita tal cual— salvo que quien administra el
 * servidor lo permita, y que un sistema que no contesta no deje el aviso colgado.
 */

const transportWith = (privateHosts?: string) =>
  new WebhookTransport({ get: (key: string) => (key === 'WEBHOOK_PRIVATE_HOSTS' ? privateHosts : undefined) } as never);

/** Un servidor local que cuenta las conexiones y no contesta nada. */
async function silentServer(): Promise<{ port: number; connections: () => number; close: () => Promise<void> }> {
  const sockets = new Set<Socket>();
  let count = 0;
  const server: Server = createServer((socket) => {
    count++;
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  return {
    port,
    connections: () => count,
    close: () => {
      sockets.forEach((socket) => socket.destroy());
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

describe('isInternalAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.10',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    'fe80::1',
    'fd12:3456::1',
    '::ffff:10.0.0.1',
    '::ffff:127.0.0.1',
  ])('%s es interna', (address) => {
    expect(isInternalAddress(address)).toBe(true);
  });

  it.each(['8.8.8.8', '186.114.250.178', '2800:3f0:4005::1', '::ffff:8.8.8.8'])('%s es pública', (address) => {
    expect(isInternalAddress(address)).toBe(false);
  });
});

describe('WebhookTransport', () => {
  let server: Awaited<ReturnType<typeof silentServer>>;
  beforeEach(async () => {
    server = await silentServer();
  });
  afterEach(() => server.close());

  it.each([
    ['un nombre que resuelve a la propia máquina', (port: number) => `https://localhost:${port}/avisos`],
    ['una IPv4 escrita tal cual', (port: number) => `https://127.0.0.1:${port}/avisos`],
    ['una IPv6 escrita tal cual', (port: number) => `https://[::1]:${port}/avisos`],
  ])('no envía a %s, y ni siquiera conecta', async (_case, urlFor) => {
    await expect(transportWith().post(urlFor(server.port), {}, '{}', 2_000)).rejects.toBeInstanceOf(
      InternalAddressError,
    );
    expect(server.connections()).toBe(0);
  });

  it('con el nombre o la IP permitidos por el servidor, sí conecta', async () => {
    for (const host of ['localhost', '127.0.0.1']) {
      const outcome = transportWith(` ${host.toUpperCase()} , otro.example`).post(
        `https://${host}:${server.port}/avisos`,
        {},
        '{}',
        150,
      );
      // El servidor de la prueba no habla HTTPS: basta con que la conexión llegue a él.
      await expect(outcome).rejects.not.toBeInstanceOf(InternalAddressError);
    }
    expect(server.connections()).toBe(2);
  });

  it('si el otro sistema no contesta a tiempo, corta y lo dice', async () => {
    await expect(
      transportWith('localhost').post(`https://localhost:${server.port}/avisos`, {}, '{}', 150),
    ).rejects.toBeInstanceOf(NoAnswerError);
  });
});
