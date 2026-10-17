import { PassThrough } from 'stream';
import { createGunzip } from 'zlib';
import type { ServerResponse } from 'http';
import { acceptsGzip, eventStreamOutput } from './event-stream';

/**
 * El flujo de eventos sale comprimido por la propia API para que Apache o LiteSpeed no lo
 * compriman y lo retengan. Lo que importa es que cada evento llegue entero en cuanto se
 * escribe: si la compresión esperase a juntar más, el tiempo real seguiría sin funcionar.
 */
describe('eventStreamOutput', () => {
  /**
   * Lo que va descomprimiendo el navegador. `received` se cumple cuando ha leído exactamente
   * el texto indicado; si la compresión lo retuviera, la prueba fallaría por tiempo.
   */
  function browserReading(response: PassThrough) {
    let decoded = '';
    const gunzip = response.pipe(createGunzip());
    gunzip.on('data', (chunk: Buffer) => (decoded += chunk.toString()));

    return (expected: string) =>
      new Promise<void>((resolve) => {
        const check = () => {
          if (decoded !== expected) return;
          gunzip.off('data', check);
          resolve();
        };
        gunzip.on('data', check);
        check();
      });
  }

  it('cada evento se puede descomprimir en cuanto se escribe, sin esperar al siguiente', async () => {
    const response = new PassThrough();
    const received = browserReading(response);
    const output = eventStreamOutput(response as unknown as ServerResponse, true);

    output.write('event: message:new\ndata: {"a":1}\n\n');
    await received('event: message:new\ndata: {"a":1}\n\n');

    output.write(': ping\n\n');
    await received('event: message:new\ndata: {"a":1}\n\n: ping\n\n');
  });

  it('sin gzip escribe directamente en la respuesta', () => {
    const response = new PassThrough();
    expect(eventStreamOutput(response as unknown as ServerResponse, false)).toBe(response);
  });
});

describe('acceptsGzip', () => {
  it('reconoce lo que mandan los navegadores', () => {
    expect(acceptsGzip('gzip, deflate, br, zstd')).toBe(true);
    expect(acceptsGzip('br;q=1.0, gzip;q=0.8, *;q=0.1')).toBe(true);
  });

  it('respeta un rechazo explícito y la ausencia de cabecera', () => {
    expect(acceptsGzip('gzip;q=0, br')).toBe(false);
    expect(acceptsGzip('identity')).toBe(false);
    expect(acceptsGzip(undefined)).toBe(false);
  });
});
