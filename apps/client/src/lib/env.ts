/**
 * Resolución de la URL de la API.
 *
 * `NEXT_PUBLIC_API_URL` se incrusta en tiempo de compilación, lo que obliga a rehacer el
 * build para cada dominio. Para no depender de eso en cPanel, cuando la variable apunta a
 * localhost pero la página se sirve desde un dominio real, la URL se deduce del propio
 * host: así el mismo artefacto vale para cualquier despliegue.
 *
 * Antes esta deducción estaba repetida en tres sitios con reglas distintas (aquí, en el
 * layout del servidor y en el contexto de WebSocket, que además reescribía el protocolo
 * con expresiones regulares). Ahora es este único punto.
 */

/** Prefijos de host y el prefijo equivalente de la API. */
const EQUIVALENCIAS: readonly { prefijo: string; api: string }[] = [
  { prefijo: 'lms.', api: 'api-lms.' },
  { prefijo: 'lms-', api: 'api-lms-' },
  { prefijo: 'campus.', api: 'api-campus.' },
];

const POR_DEFECTO = 'http://localhost:3200/api';

function esLocal(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
}

function apiDeducida(protocolo: string, host: string): string {
  const equivalencia = EQUIVALENCIAS.find((e) => host.startsWith(e.prefijo));
  const hostApi = equivalencia ? host.replace(equivalencia.prefijo, equivalencia.api) : `api.${host}`;
  return `${protocolo}//${hostApi}/api`;
}

/**
 * URL base de la API, sin barra final.
 * Se calcula en cada llamada en el navegador porque el host sólo se conoce allí; en el
 * servidor se usa tal cual la variable de entorno.
 */
export function apiUrl(): string {
  const configurada = (process.env.NEXT_PUBLIC_API_URL || POR_DEFECTO).replace(/\/+$/, '');

  if (typeof window === 'undefined') return configurada;

  const apuntaALocal = configurada.includes('localhost') || configurada.includes('127.0.0.1');
  if (apuntaALocal && !esLocal(window.location.hostname)) {
    return apiDeducida(window.location.protocol, window.location.hostname);
  }

  return configurada;
}

/** URL absoluta de un recurso de la API a partir de una ruta relativa (`/storage/...`). */
export function urlAbsoluta(ruta: string): string {
  if (!ruta) return '';
  if (ruta.startsWith('http://') || ruta.startsWith('https://')) return ruta;

  const base = apiUrl();
  // Las rutas firmadas por la API ya vienen con el prefijo `/api`.
  const origen = base.replace(/\/api$/, '');
  return `${origen}${ruta.startsWith('/') ? '' : '/'}${ruta}`;
}
