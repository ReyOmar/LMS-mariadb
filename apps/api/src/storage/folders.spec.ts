import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FORMATS_BY_FOLDER } from './folders';

/**
 * Los formatos que un alumno puede entregar están escritos dos veces: aquí, que es quien
 * los hace cumplir, y en el cliente, que los comprueba antes de subir para no hacer
 * esperar una subida que se va a rechazar. Si se separan, el alumno ve aceptado un archivo
 * que luego se rechaza, o rechazado uno que se habría aceptado.
 */

const CLIENT_LIST = join(__dirname, '../../../client/src/components/assignments/allowed-files.ts');

function clientFormats(source: string): string[] {
  const block = source.match(/ALLOWED_EXTENSIONS\s*=\s*\[([\s\S]*?)\]/);
  if (!block) throw new Error('No se encontró ALLOWED_EXTENSIONS en el cliente.');
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('Formatos de entrega', () => {
  it('coinciden con los que ofrece el cliente', () => {
    if (!existsSync(CLIENT_LIST)) {
      // La API puede desplegarse sola; entonces no hay nada con lo que comparar.
      console.warn('No está el cliente; se omite la comparación de formatos.');
      return;
    }

    const fromClient = clientFormats(readFileSync(CLIENT_LIST, 'utf8'));

    expect([...fromClient].sort()).toEqual([...(FORMATS_BY_FOLDER.entregas ?? [])].sort());
  });
});
