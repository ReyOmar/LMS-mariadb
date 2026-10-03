import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REALTIME_EVENTS } from './events';

/**
 * El catálogo de eventos está escrito dos veces: aquí y en el cliente.
 *
 * No hay paquete compartido entre las dos aplicaciones —montarlo por un fichero de
 * literales costaría más de lo que resuelve—, así que la coincidencia se comprueba aquí.
 * Sin esta prueba, el único aviso de que las listas se han separado sería un aviso que
 * nunca llega a la pantalla, y eso no se nota hasta que alguien lo reporta.
 */

const CLIENT_CATALOG = join(__dirname, '../../../client/src/lib/realtime/events.ts');

/** Extrae los literales de la constante `REALTIME_EVENTS` del fichero del cliente. */
function clientEvents(source: string): string[] {
  const block = source.match(/REALTIME_EVENTS\s*=\s*\[([\s\S]*?)\]\s*as const/);
  if (!block) throw new Error('No se encontró REALTIME_EVENTS en el cliente.');
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('Catálogo de eventos en tiempo real', () => {
  it('no tiene nombres repetidos', () => {
    expect(new Set(REALTIME_EVENTS).size).toBe(REALTIME_EVENTS.length);
  });

  it('coincide con el del cliente', () => {
    if (!existsSync(CLIENT_CATALOG)) {
      // La API puede desplegarse sola; entonces no hay nada con lo que comparar.
      console.warn('No está el cliente; se omite la comparación del catálogo.');
      return;
    }

    const fromClient = clientEvents(readFileSync(CLIENT_CATALOG, 'utf8'));

    expect([...fromClient].sort()).toEqual([...REALTIME_EVENTS].sort());
  });
});
