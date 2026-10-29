import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';

/**
 * Lectura del cliente para las pruebas que comprueban que sus copias de las reglas de la API
 * dicen lo mismo. No hay paquete compartido entre las dos aplicaciones: estas pruebas las atan.
 */
const CLIENT_ROOT = join(__dirname, '../../../../client');

/** El fuente de un archivo de `apps/client`, o `null` si el cliente no está junto a la API. */
export function clientSource(path: string): string | null {
  const file = join(CLIENT_ROOT, path);
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

/**
 * Un módulo del cliente sin dependencias, compilado y cargado: así una prueba compara lo que hacen
 * las dos copias de una regla, no sólo lo que dicen. `null` si el cliente no está junto a la API.
 */
export function clientModule<T>(path: string): T | null {
  const source = clientSource(path);
  if (source === null) return null;
  const { outputText } = transpileModule(source, {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  });
  const module = { exports: {} as T };
  runInNewContext(outputText, { module, exports: module.exports });
  return module.exports;
}

/** El contenido de la lista o el objeto que se asigna a `name`, tenga o no anotación de tipo. */
function blockOf(source: string, name: string, open: '[' | '{'): string {
  const close = open === '[' ? '\\]' : '\\}';
  const match = new RegExp(`\\b${name}\\b(?::[^=]*)?\\s*=\\s*\\${open}([\\s\\S]*?)${close}`).exec(source);
  if (!match) throw new Error(`No se encontró ${name} en el cliente.`);
  return match[1];
}

/** Valor numérico de `name = 8` o `name: 8`. */
export function numberIn(source: string, name: string): number {
  const match = new RegExp(`\\b${name}\\b\\s*[=:]\\s*([\\d_.]+)`).exec(source);
  if (!match) throw new Error(`No se encontró ${name} en el cliente.`);
  return Number(match[1].replace(/_/g, ''));
}

/** Los textos entre comillas simples de la lista `name = [...]`. */
export function textsIn(source: string, name: string): string[] {
  return [...blockOf(source, name, '[').matchAll(/'([^']*)'/g)].map((match) => match[1]);
}

/** Las entradas `clave: valor` del objeto `name = { ... }`, con el valor tal como está escrito. */
export function entriesIn(source: string, name: string): Record<string, string> {
  const entries = blockOf(source, name, '{').matchAll(/(\w+):\s*('(?:[^'\\]|\\.)*'|[^,\n]+)/g);
  return Object.fromEntries([...entries].map(([, key, value]) => [key, value.trim().replace(/^'|'$/g, '')]));
}
