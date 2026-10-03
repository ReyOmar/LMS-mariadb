/**
 * Resolución de la URL de la API.
 *
 * `NEXT_PUBLIC_API_URL` se incrusta en tiempo de compilación, lo que obliga a rehacer el
 * build para cada dominio. Para no depender de eso en cPanel, cuando la variable apunta a
 * localhost pero la página se sirve desde un dominio real, la URL se deduce del propio
 * host: así el mismo artefacto vale para cualquier despliegue.
 */

/** Prefijos de host y el prefijo equivalente de la API. */
const HOST_MAPPINGS: readonly { prefix: string; api: string }[] = [
  { prefix: 'lms.', api: 'api-lms.' },
  { prefix: 'lms-', api: 'api-lms-' },
  { prefix: 'campus.', api: 'api-campus.' },
];

const DEFAULT_URL = 'http://localhost:3200/api';

function isLocal(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
}

function inferApiUrl(protocol: string, host: string): string {
  const mapping = HOST_MAPPINGS.find((e) => host.startsWith(e.prefix));
  const hostApi = mapping ? host.replace(mapping.prefix, mapping.api) : `api.${host}`;
  return `${protocol}//${hostApi}/api`;
}

/**
 * URL base de la API, sin barra final.
 * Se calcula en cada llamada en el navegador porque el host sólo se conoce allí; en el
 * servidor se usa tal cual la variable de entorno.
 */
export function apiUrl(): string {
  const configured = (process.env.NEXT_PUBLIC_API_URL || DEFAULT_URL).replace(/\/+$/, '');

  if (typeof window === 'undefined') return configured;

  const pointsToLocalhost = configured.includes('localhost') || configured.includes('127.0.0.1');
  if (pointsToLocalhost && !isLocal(window.location.hostname)) {
    return inferApiUrl(window.location.protocol, window.location.hostname);
  }

  return configured;
}

/** URL absoluta de un recurso de la API a partir de una ruta relativa (`/storage/...`). */
export function absoluteUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;

  const base = apiUrl();
  // Las rutas firmadas por la API ya vienen con el prefijo `/api`.
  const origin = base.replace(/\/api$/, '');
  return `${origin}${path.startsWith('/') ? '' : '/'}${path}`;
}
