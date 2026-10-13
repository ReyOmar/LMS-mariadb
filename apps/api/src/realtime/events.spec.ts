import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REALTIME_EVENTS } from './events';

// El catálogo está escrito aquí y en el cliente, sin paquete compartido: un evento de más o de
// menos en cualquiera de los dos es un aviso que nunca llega a la pantalla.

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
