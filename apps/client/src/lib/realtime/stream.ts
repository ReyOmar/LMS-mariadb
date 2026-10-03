import { RealtimeMessage } from './events';

/**
 * Lector de un flujo Server-Sent Events.
 *
 * Se usa `fetch` con lectura por streaming en lugar de `EventSource` por una razón
 * concreta: `EventSource` no permite añadir cabeceras, así que el token tendría que viajar
 * en la URL y acabaría escrito en los registros de acceso de Apache y de cualquier proxy
 * intermedio. Con `fetch` va en `Authorization`, donde corresponde.
 *
 * A cambio hay que implementar la reconexión, que es lo que hace `connectStream`.
 */

interface StreamOptions {
  url: string;
  token: string;
  onMessage: (message: RealtimeMessage) => void;
  onConnectionChange: (connected: boolean) => void;
  /** Se invoca cuando el servidor rechaza la sesión; no tiene sentido reintentar. */
  onUnauthorized: () => void;
  signal: AbortSignal;
}

/** Espera entre reintentos, creciente y con tope. */
const INITIAL_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;

/**
 * Mantiene el flujo abierto mientras no se aborte la señal.
 * Cada corte se reintenta con espera creciente; un 401 detiene el ciclo.
 */
export async function connectStream(options: StreamOptions): Promise<void> {
  let delay = INITIAL_DELAY_MS;

  while (!options.signal.aborted) {
    try {
      await readStream(options);
      // Un cierre limpio del servidor se reintenta enseguida: suele ser un reinicio.
      delay = INITIAL_DELAY_MS;
    } catch (error) {
      if (options.signal.aborted) return;
      if (error instanceof AuthorizationError) {
        options.onUnauthorized();
        return;
      }
      delay = Math.min(delay * 2, MAX_DELAY_MS);
    }

    options.onConnectionChange(false);
    if (options.signal.aborted) return;
    await sleep(delay, options.signal);
  }
}

class AuthorizationError extends Error {}

async function readStream(options: StreamOptions): Promise<void> {
  const response = await fetch(options.url, {
    headers: { Authorization: `Bearer ${options.token}`, Accept: 'text/event-stream' },
    signal: options.signal,
    // El flujo no se cachea nunca: una respuesta cacheada sería un flujo muerto.
    cache: 'no-store',
  });

  if (response.status === 401 || response.status === 403) {
    throw new AuthorizationError();
  }
  if (!response.ok || !response.body) {
    throw new Error(`El servidor respondió ${response.status}`);
  }

  options.onConnectionChange(true);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;

      buffer += decoder.decode(value, { stream: true });

      // Las tramas SSE se separan por línea en blanco. La última puede estar a medias,
      // así que se conserva para el siguiente trozo.
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        const message = parseFrame(frame);
        if (message) options.onMessage(message);
      }
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
}

/**
 * Extrae el JSON de una trama SSE.
 * Devuelve `null` para los latidos (`: ping`) y para cualquier trama que no se entienda,
 * en vez de dejar caer el flujo entero por un mensaje suelto mal formado.
 */
function parseFrame(frame: string): RealtimeMessage | null {
  const data = frame
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('\n');

  if (!data) return null;

  try {
    const message = JSON.parse(data) as RealtimeMessage;
    return message?.event ? message : null;
  } catch {
    return null;
  }
}

/** Espera cortable: si se aborta la señal, resuelve de inmediato y no deja temporizadores. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    signal.addEventListener('abort', onAbort, { once: true });
  });
}
