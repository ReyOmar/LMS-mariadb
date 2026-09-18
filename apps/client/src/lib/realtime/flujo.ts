import { MensajeRealtime } from './eventos';

/**
 * Lector de un flujo Server-Sent Events.
 *
 * Se usa `fetch` con lectura por streaming en lugar de `EventSource` por una razón
 * concreta: `EventSource` no permite añadir cabeceras, así que el token tendría que viajar
 * en la URL y acabaría escrito en los registros de acceso de Apache y de cualquier proxy
 * intermedio. Con `fetch` va en `Authorization`, donde corresponde.
 *
 * A cambio hay que implementar la reconexión, que es lo que hace `conectarFlujo`.
 */

interface OpcionesFlujo {
  url: string;
  token: string;
  onMensaje: (mensaje: MensajeRealtime) => void;
  onEstado: (conectado: boolean) => void;
  /** Se invoca cuando el servidor rechaza la sesión; no tiene sentido reintentar. */
  onNoAutorizado: () => void;
  signal: AbortSignal;
}

/** Espera entre reintentos, creciente y con tope. */
const ESPERA_INICIAL_MS = 1_000;
const ESPERA_MAXIMA_MS = 30_000;

/**
 * Mantiene el flujo abierto mientras no se aborte la señal.
 * Cada corte se reintenta con espera creciente; un 401 detiene el ciclo.
 */
export async function conectarFlujo(opciones: OpcionesFlujo): Promise<void> {
  let espera = ESPERA_INICIAL_MS;

  while (!opciones.signal.aborted) {
    try {
      await leerFlujo(opciones);
      // Un cierre limpio del servidor se reintenta enseguida: suele ser un reinicio.
      espera = ESPERA_INICIAL_MS;
    } catch (error) {
      if (opciones.signal.aborted) return;
      if (error instanceof ErrorDeAutorizacion) {
        opciones.onNoAutorizado();
        return;
      }
      espera = Math.min(espera * 2, ESPERA_MAXIMA_MS);
    }

    opciones.onEstado(false);
    if (opciones.signal.aborted) return;
    await dormir(espera, opciones.signal);
  }
}

class ErrorDeAutorizacion extends Error {}

async function leerFlujo(opciones: OpcionesFlujo): Promise<void> {
  const respuesta = await fetch(opciones.url, {
    headers: { Authorization: `Bearer ${opciones.token}`, Accept: 'text/event-stream' },
    signal: opciones.signal,
    // El flujo no se cachea nunca: una respuesta cacheada sería un flujo muerto.
    cache: 'no-store',
  });

  if (respuesta.status === 401 || respuesta.status === 403) {
    throw new ErrorDeAutorizacion();
  }
  if (!respuesta.ok || !respuesta.body) {
    throw new Error(`El servidor respondió ${respuesta.status}`);
  }

  opciones.onEstado(true);

  const lector = respuesta.body.getReader();
  const decodificador = new TextDecoder();
  let pendiente = '';

  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) return;

      pendiente += decodificador.decode(value, { stream: true });

      // Las tramas SSE se separan por línea en blanco. La última puede estar a medias,
      // así que se conserva para el siguiente trozo.
      const tramas = pendiente.split('\n\n');
      pendiente = tramas.pop() ?? '';

      for (const trama of tramas) {
        const mensaje = interpretarTrama(trama);
        if (mensaje) opciones.onMensaje(mensaje);
      }
    }
  } finally {
    lector.cancel().catch(() => undefined);
  }
}

/**
 * Extrae el JSON de una trama SSE.
 * Devuelve `null` para los latidos (`: ping`) y para cualquier trama que no se entienda,
 * en vez de dejar caer el flujo entero por un mensaje suelto mal formado.
 */
function interpretarTrama(trama: string): MensajeRealtime | null {
  const datos = trama
    .split('\n')
    .filter((linea) => linea.startsWith('data:'))
    .map((linea) => linea.slice(5).trim())
    .join('\n');

  if (!datos) return null;

  try {
    const mensaje = JSON.parse(datos) as MensajeRealtime;
    return mensaje?.event ? mensaje : null;
  } catch {
    return null;
  }
}

/** Espera cortable: si se aborta la señal, resuelve de inmediato y no deja temporizadores. */
function dormir(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const alAbortar = () => {
      clearTimeout(temporizador);
      resolve();
    };
    const temporizador = setTimeout(() => {
      signal.removeEventListener('abort', alAbortar);
      resolve();
    }, ms);

    signal.addEventListener('abort', alAbortar, { once: true });
  });
}
