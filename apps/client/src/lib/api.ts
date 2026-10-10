import axios, { AxiosError, AxiosInstance } from 'axios';
import { apiUrl, absoluteUrl } from './env';
import { readLocal, readLocalJson, removeLocal, writeLocal } from './local-storage';
import { fileSizeWarning, type UploadLimit } from './upload-limits';

/**
 * Cliente HTTP único del campus.
 *
 * Responsabilidades, y ninguna más:
 *  - Adjuntar el token de sesión.
 *  - Traducir un 401 en un cierre de sesión ordenado.
 *  - Convertir cualquier error en un mensaje que una pantalla pueda enseñar tal cual.
 *
 * La sede **no** se envía en las peticiones autenticadas: el servidor la deduce del token.
 * Sólo las llamadas públicas de la portada la pasan por query, y lo hacen explícitamente.
 */

/** Motivos por los que se llega al login sin haber pulsado «cerrar sesión». */
const LOGOUT_REASON_KEYS = ['expired', 'revoked', 'displaced', 'password', 'role'] as const;

export type LogoutReason = (typeof LOGOUT_REASON_KEYS)[number];

/** ¿Es un motivo que el login sabe explicar? Lo que llega por la URL puede ser cualquier cosa. */
export function isLogoutReason(value: unknown): value is LogoutReason {
  return typeof value === 'string' && (LOGOUT_REASON_KEYS as readonly string[]).includes(value);
}

const TOKEN_KEY = 'lms_token';
const USER_KEY = 'lms_user';

/**
 * Motivos por los que el servidor corta una sesión, deducidos del mensaje que devuelve.
 * El orden importa: se comprueba el más específico primero.
 */
const LOGOUT_REASONS: { reason: LogoutReason; signals: string[] }[] = [
  { reason: 'displaced', signals: ['otro dispositivo'] },
  { reason: 'revoked', signals: ['revocada', 'eliminada', 'ya no existe'] },
];

const api: AxiosInstance = axios.create({
  baseURL: apiUrl(),
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
});

api.interceptors.request.use((config) => {
  // La URL base se recalcula por si la página se abrió antes de conocer el host.
  config.baseURL = apiUrl();

  const token = readToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // Un POST sin cuerpo no debe anunciarse como JSON: Fastify lo rechaza con un 400
  // «Body cannot be empty» (empezar un cuestionario, tomar el aviso de edición de un curso).
  if (config.data === undefined || config.data === null) {
    delete config.headers['Content-Type'];
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message?: string }>) => {
    if (error.response?.status === 401) handleExpiredSession(error);
    return Promise.reject(error);
  },
);

export function readToken(): string | null {
  return readLocal(TOKEN_KEY);
}

export function saveSession(token: string, user: unknown): void {
  writeLocal(TOKEN_KEY, token);
  writeLocal(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  removeLocal(TOKEN_KEY);
  removeLocal(USER_KEY);
}

export function readStoredUser<T>(): T | null {
  return readLocalJson<T>(USER_KEY);
}

/**
 * Limpia la sesión y lleva al login explicando qué pasó.
 *
 * Se distingue «te echaron» de «caducó» porque el mensaje que merece el usuario es
 * distinto: el primero le dice que hable con el administrador y el segundo que vuelva a
 * entrar. Si estaba en una página pública no se le interrumpe.
 */
function handleExpiredSession(error: AxiosError<{ message?: string }>): void {
  if (typeof window === 'undefined') return;

  const pathname = window.location.pathname;
  if (pathname.startsWith('/login')) return;

  clearSession();

  const inPrivateArea = pathname.startsWith('/dashboard') || pathname.startsWith('/courses');
  if (!inPrivateArea) return;

  const message = (error.response?.data?.message ?? '').toLowerCase();
  const match = LOGOUT_REASONS.find((entry) => entry.signals.some((signal) => message.includes(signal)));
  redirectToLogin(match?.reason ?? 'expired');
}

/**
 * Lleva al login con el motivo, que la pantalla de acceso explica al usuario, y con la
 * página en la que estaba, para devolverlo a ella al volver a entrar.
 */
export function redirectToLogin(reason: LogoutReason): void {
  window.location.href = loginUrl(reason, `${window.location.pathname}${window.location.search}`);
}

/** Dirección del login con el motivo de la salida y la página a la que volver después. */
export function loginUrl(reason?: LogoutReason, next?: string | null): string {
  const params = new URLSearchParams();
  if (reason) params.set('reason', reason);
  const destination = safeNextPath(next);
  if (destination) params.set('next', destination);
  const query = params.toString();
  return query ? `/login?${query}` : '/login';
}

/** Origen inventado para resolver rutas relativas sin depender de la página actual. */
const PATH_BASE = 'https://campus.invalid';

/**
 * Ruta del propio campus a la que se puede volver tras el login, o `null`.
 *
 * El parámetro `next` llega por la URL y lo puede escribir cualquiera: sólo se acepta una
 * ruta relativa que no salga del campus (nada de `//otro.sitio`, `/\otro.sitio` ni
 * `javascript:`), y nunca el propio login.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/')) return null;
  try {
    const url = new URL(value, PATH_BASE);
    if (url.origin !== PATH_BASE || url.pathname === '/login' || url.pathname.startsWith('/login/')) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/**
 * Petición autenticada que sale aunque la pestaña se esté cerrando.
 *
 * axios no admite `keepalive`, así que se usa `fetch`. No se espera la respuesta ni se
 * informa de errores: sirve para avisos al servidor (cerrar sesión, soltar el aviso de
 * edición de un curso) que no pueden retener al usuario.
 */
export function sendKeepalive(method: 'POST' | 'DELETE', path: string): void {
  const token = readToken();
  void fetch(`${apiUrl()}${path}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    keepalive: true,
  }).catch(() => undefined);
}

/**
 * ¿Falló la petición sin que el servidor llegara a responder?
 *
 * Sirve para no confundir «sin conexión» con «el servidor rechazó la sesión».
 */
export function isNetworkFailure(error: unknown): boolean {
  return axios.isAxiosError(error) && !error.response;
}

/** Lo que dura el límite de intentos del servidor cuando no dice cuánto queda. */
const DEFAULT_RETRY_AFTER_SECONDS = 60;

/**
 * Segundos que hay que esperar antes de repetir una petición rechazada por exceso de
 * intentos (429), según la cabecera `Retry-After` del servidor. Cero si el error es otro.
 */
export function retryAfterSeconds(error: unknown): number {
  if (!axios.isAxiosError(error) || error.response?.status !== 429) return 0;
  const seconds = Number(error.response.headers?.['retry-after']);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : DEFAULT_RETRY_AFTER_SECONDS;
}

/**
 * Mensaje presentable de un error de red o de la API.
 *
 * La API responde siempre `{ message }` con un texto pensado para leerse. Aquí se cubren
 * los casos en que no hay respuesta —sin conexión, tiempo agotado, servidor caído— para
 * que ninguna pantalla acabe mostrando «undefined» o un volcado de error.
 */
export function errorMessage(error: unknown, fallback = 'No se pudo completar la operación.'): string {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error && error.message ? error.message : fallback;
  }

  const response = error.response;
  if (!response) {
    if (error.code === 'ECONNABORTED') {
      return 'La operación tardó demasiado. Revisa tu conexión e inténtalo de nuevo.';
    }
    return 'No hay conexión con el servidor. Comprueba tu red e inténtalo de nuevo.';
  }

  const serverMessage = (response.data as { message?: string } | undefined)?.message;
  if (serverMessage) return serverMessage;

  switch (response.status) {
    case 401:
      return 'Tu sesión ha caducado. Vuelve a iniciar sesión.';
    case 403:
      return 'No tienes permiso para realizar esta acción.';
    case 404:
      return 'No encontramos lo que buscabas.';
    case 409:
      return 'Ya existe un registro con esos datos.';
    case 413:
      // La API siempre dice cuál es el límite; sin mensaje, quien cortó fue el servidor web.
      return 'El servidor rechazó el archivo por su tamaño antes de procesarlo. Avisa al administrador de la plataforma.';
    case 429:
      return 'Has hecho demasiadas peticiones seguidas. Espera un momento e inténtalo de nuevo.';
    case 502:
    case 503:
    case 504:
      // Respaldo por si el servidor cayó antes de poder redactar su propio mensaje.
      return 'El servicio no está disponible en este momento. Inténtalo de nuevo en unos minutos.';
    default:
      return fallback;
  }
}

/** Sin avance durante este tiempo, la subida se da por perdida. */
const UPLOAD_STALL_MS = 120_000;

export const UPLOAD_STALLED_MESSAGE =
  'La subida se detuvo: no se envió nada en los últimos 2 minutos. Revisa tu conexión e inténtalo de nuevo.';

export interface UploadOptions {
  /**
   * Límite exacto que aplicará el servidor (ver `uploadLimit` en `upload-limits.ts`).
   * Lo que lo supere se rechaza aquí, con el mismo mensaje, sin enviar nada.
   */
  limit?: UploadLimit | null;
  /** Porcentaje 0–100 de lo enviado, para mostrar una barra en lugar de un giro indefinido. */
  onProgress?: (percent: number) => void;
}

/**
 * Sube un archivo por `multipart/form-data`.
 *
 * No tiene tiempo máximo: un archivo de 1 GB con una conexión lenta tarda lo que tarde.
 * Lo que se vigila es que avance; si deja de enviarse durante dos minutos, se cancela.
 * Una vez enviado todo, el servidor todavía lo guarda —con archivos grandes puede tardar—,
 * y esa espera no se corta.
 */
export async function uploadFile<T = { filename: string; url: string }>(
  endpoint: string,
  file: File,
  { limit, onProgress }: UploadOptions = {},
): Promise<T> {
  const warning = fileSizeWarning(file, limit);
  if (warning) throw new Error(warning);

  const body = new FormData();
  body.append('file', file);

  const controller = new AbortController();
  let stalled = false;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  const watch = () => {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      stalled = true;
      controller.abort();
    }, UPLOAD_STALL_MS);
  };

  watch();
  try {
    const { data } = await api.post<T>(endpoint, body, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 0,
      signal: controller.signal,
      onUploadProgress: (event) => {
        const total = event.total || file.size;
        if (event.loaded >= total) clearTimeout(watchdog);
        else watch();
        onProgress?.(Math.min(100, Math.round((event.loaded / total) * 100)));
      },
    });
    return data;
  } catch (error) {
    if (stalled) throw new Error(UPLOAD_STALLED_MESSAGE);
    throw error;
  } finally {
    clearTimeout(watchdog);
  }
}

/**
 * URL con la que el navegador puede pedir un archivo.
 *
 * Acepta las dos formas en que la API se refiere a un archivo, y las distingue sola:
 *
 *  - Una **ruta ya servible**, que la API devuelve firmada y caducable para el material
 *    reservado (entregas, certificados, firmas, contenido de curso). Siempre empieza por
 *    `/api/…`, así que sólo hay que completarle el origen.
 *  - Una **clave de almacenamiento** como `avatars/1790-ab.png`, que es lo que guardan las
 *    columnas de marca (foto de perfil, logotipo, favicon, fondo del acceso, portada de
 *    curso). Nunca empieza por `/`, y hay que dirigirla a la ruta de descarga.
 *
 * Una dirección completa (`https://…`) o una imagen incrustada (`data:image/…`, como las de
 * algunos bloques antiguos) ya se pueden pedir tal cual.
 */
export function fileUrlFor(pathOrKey: string | null | undefined): string | null {
  if (!pathOrKey) return null;
  if (/^(https?:\/\/|data:image\/)/.test(pathOrKey)) return pathOrKey;
  if (pathOrKey.startsWith('/')) return absoluteUrl(pathOrKey);
  return absoluteUrl(`/api/storage/download/${pathOrKey}`);
}

export { apiUrl };
export default api;
