import axios, { AxiosError, AxiosInstance } from 'axios';
import { apiUrl, urlAbsoluta } from './env';

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

const CLAVE_TOKEN = 'lms_token';
const CLAVE_USUARIO = 'lms_user';

/**
 * Motivos por los que el servidor corta una sesión, deducidos del mensaje que devuelve.
 * El orden importa: se comprueba el más específico primero.
 */
const MOTIVOS_DE_SALIDA: { motivo: 'desplazada' | 'revocada'; senales: string[] }[] = [
  { motivo: 'desplazada', senales: ['otro dispositivo'] },
  { motivo: 'revocada', senales: ['revocada', 'eliminada', 'desactivada', 'ya no existe'] },
];

const api: AxiosInstance = axios.create({
  baseURL: apiUrl(),
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
});

api.interceptors.request.use((config) => {
  // La URL base se recalcula por si la página se abrió antes de conocer el host.
  config.baseURL = apiUrl();

  const token = leerToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (respuesta) => respuesta,
  (error: AxiosError<{ message?: string }>) => {
    if (error.response?.status === 401) manejarSesionCaducada(error);
    return Promise.reject(error);
  },
);

function leerToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(CLAVE_TOKEN);
  } catch {
    return null;
  }
}

export function guardarSesion(token: string, usuario: unknown): void {
  try {
    window.localStorage.setItem(CLAVE_TOKEN, token);
    window.localStorage.setItem(CLAVE_USUARIO, JSON.stringify(usuario));
  } catch {
    // Sin almacenamiento la sesión dura lo que la pestaña; no es motivo para fallar.
  }
}

export function borrarSesion(): void {
  try {
    window.localStorage.removeItem(CLAVE_TOKEN);
    window.localStorage.removeItem(CLAVE_USUARIO);
  } catch {
    /* nada que hacer */
  }
}

export function leerUsuarioGuardado<T>(): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const crudo = window.localStorage.getItem(CLAVE_USUARIO);
    return crudo ? (JSON.parse(crudo) as T) : null;
  } catch {
    return null;
  }
}

/**
 * Limpia la sesión y lleva al login explicando qué pasó.
 *
 * Se distingue «te echaron» de «caducó» porque el mensaje que merece el usuario es
 * distinto: el primero le dice que hable con el administrador y el segundo que vuelva a
 * entrar. Si estaba en una página pública no se le interrumpe.
 */
function manejarSesionCaducada(error: AxiosError<{ message?: string }>): void {
  if (typeof window === 'undefined') return;

  const ruta = window.location.pathname;
  if (ruta.startsWith('/login')) return;

  borrarSesion();

  const mensaje = (error.response?.data?.message ?? '').toLowerCase();
  const coincidencia = MOTIVOS_DE_SALIDA.find((entrada) =>
    entrada.senales.some((senal) => mensaje.includes(senal)),
  );

  const enZonaPrivada = ruta.startsWith('/dashboard') || ruta.startsWith('/cursos');
  if (!enZonaPrivada) return;

  window.location.href = `/login?motivo=${coincidencia?.motivo ?? 'expirada'}`;
}

/**
 * Mensaje presentable de un error de red o de la API.
 *
 * La API responde siempre `{ message }` con un texto pensado para leerse. Aquí se cubren
 * los casos en que no hay respuesta —sin conexión, tiempo agotado, servidor caído— para
 * que ninguna pantalla acabe mostrando «undefined» o un volcado de error.
 */
export function mensajeDeError(error: unknown, respaldo = 'No se pudo completar la operación.'): string {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error && error.message ? error.message : respaldo;
  }

  const respuesta = error.response;
  if (!respuesta) {
    if (error.code === 'ECONNABORTED') {
      return 'La operación tardó demasiado. Revisa tu conexión e inténtalo de nuevo.';
    }
    return 'No hay conexión con el servidor. Comprueba tu red e inténtalo de nuevo.';
  }

  const mensajeServidor = (respuesta.data as { message?: string } | undefined)?.message;
  if (mensajeServidor) return mensajeServidor;

  switch (respuesta.status) {
    case 401:
      return 'Tu sesión ha caducado. Vuelve a iniciar sesión.';
    case 403:
      return 'No tienes permiso para realizar esta acción.';
    case 404:
      return 'No encontramos lo que buscabas.';
    case 409:
      return 'Ya existe un registro con esos datos.';
    case 413:
      return 'El archivo es demasiado grande.';
    case 429:
      return 'Has hecho demasiadas peticiones seguidas. Espera un momento e inténtalo de nuevo.';
    default:
      return respaldo;
  }
}

/** Indica si el error corresponde a un límite de peticiones alcanzado. */
export function esLimiteDePeticiones(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 429;
}

/**
 * Sube un archivo por `multipart/form-data`.
 * @param onProgreso Porcentaje 0–100, para poder mostrar una barra en lugar de un giro
 *        indefinido en subidas grandes.
 */
export async function subirArchivo<T = { filename: string; url: string }>(
  ruta: string,
  archivo: File,
  onProgreso?: (porcentaje: number) => void,
): Promise<T> {
  const cuerpo = new FormData();
  cuerpo.append('file', archivo);

  const { data } = await api.post<T>(ruta, cuerpo, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120_000,
    onUploadProgress: (evento) => {
      if (!onProgreso || !evento.total) return;
      onProgreso(Math.round((evento.loaded / evento.total) * 100));
    },
  });
  return data;
}

/**
 * URL absoluta de un archivo.
 *
 * La API devuelve rutas ya firmadas para el material reservado (entregas, certificados,
 * firmas y contenido de curso) y rutas simples para la marca. Aquí sólo se completa el
 * origen; no se construye ninguna ruta a mano, porque una ruta sin firma no se sirve.
 */
export function urlDeArchivo(ruta: string | null | undefined): string | null {
  if (!ruta) return null;
  return urlAbsoluta(ruta);
}

/**
 * URL de un archivo de marca a partir de su clave de almacenamiento.
 *
 * Sólo vale para el material público —logotipos, portadas de curso, fondos y fotos de
 * perfil—, que se sirve sin firma. Cualquier otra clave (entregas, certificados, firmas,
 * material de curso) llega desde la API ya firmada y debe pasarse por `urlDeArchivo`.
 */
export function urlDeMarca(clave: string | null | undefined): string | null {
  if (!clave) return null;
  if (clave.startsWith('http://') || clave.startsWith('https://')) return clave;
  return urlAbsoluta(`/api/storage/download/${clave}`);
}

export { apiUrl };
export default api;
