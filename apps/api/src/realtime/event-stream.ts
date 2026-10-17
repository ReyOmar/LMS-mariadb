import type { ServerResponse } from 'http';
import type { Writable } from 'stream';
import { constants, createGzip } from 'zlib';

/**
 * Salida de un flujo de eventos.
 *
 * Si el navegador admite gzip, la propia API comprime el flujo y lo vacía tras cada evento. No
 * es por ahorrar bytes: Apache con `mod_deflate` —lo que activa en cPanel «comprimir todo el
 * contenido»— y LiteSpeed comprimen también `text/event-stream` y retienen lo comprimido hasta
 * llenar su búfer, así que los eventos no llegarían nunca y el tiempo real parecería muerto.
 * Lo que ya llega comprimido no lo vuelven a comprimir: lo dejan pasar tal cual.
 */
export function eventStreamOutput(res: ServerResponse, compressed: boolean): Writable {
  if (!compressed) return res;

  const gzip = createGzip({ flush: constants.Z_SYNC_FLUSH });
  gzip.pipe(res);
  return gzip;
}

/** ¿Admite el navegador respuestas en gzip? `gzip;q=0` es un no. */
export function acceptsGzip(acceptEncoding: string | undefined): boolean {
  return (acceptEncoding ?? '').split(',').some((option) => {
    const [coding, ...parameters] = option.trim().toLowerCase().split(';');
    const quality = parameters.map((parameter) => parameter.trim()).find((parameter) => parameter.startsWith('q='));
    return (coding === 'gzip' || coding === '*') && (quality === undefined || Number(quality.slice(2)) > 0);
  });
}
