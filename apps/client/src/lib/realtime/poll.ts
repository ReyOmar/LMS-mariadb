import axios from 'axios';
import api from '@/lib/api';
import type { RealtimeMessage } from './events';

/** Lo que contesta cada consulta (ver `RealtimeService.poll` en la API). */
interface EventBatch {
  cursor: number;
  reset: boolean;
  events: RealtimeMessage[];
}

/** Cada cuánto pregunta una pestaña a la vista y una en segundo plano; al volver a una, en el acto. */
const VISIBLE_INTERVAL_MS = 4_000;
const HIDDEN_INTERVAL_MS = 30_000;

/** Espera tras un fallo, que se dobla en cada uno hasta este tope. */
const MAX_RETRY_MS = 30_000;

interface PollOptions {
  onMessage: (message: RealtimeMessage) => void;
  /** Pudo perderse algún aviso: cada pantalla tiene que volver a pedir sus datos. */
  onReset: () => void;
  signal: AbortSignal;
}

/**
 * Pregunta al servidor qué ha pasado, cada pocos segundos, mientras no se aborte la señal.
 *
 * Son peticiones cortas, no un flujo abierto: en cPanel, un flujo por pestaña agotaría los
 * procesos de la cuenta (ver `RealtimeService` en la API). Una consulta que falla se reintenta
 * con la misma marca, así que tras un corte breve llega lo que pasó mientras tanto. Una sesión
 * que ya no vale la atiende `api`, que lleva al login con el motivo.
 */
export async function pollEvents({ onMessage, onReset, signal }: PollOptions): Promise<void> {
  let cursor: number | null = null;
  let failures = 0;

  while (!signal.aborted) {
    try {
      const params = cursor === null ? undefined : { after: cursor };
      const batch: EventBatch = (await api.get<EventBatch>('/realtime/events', { params, signal })).data;
      failures = 0;
      if (batch.reset) onReset();
      cursor = batch.cursor;
      batch.events.forEach(onMessage);
    } catch (error) {
      if (signal.aborted || (axios.isAxiosError(error) && error.response?.status === 401)) return;
      failures++;
    }
    await pause(failures > 0 ? spread(Math.min(1_000 * 2 ** failures, MAX_RETRY_MS)) : nextInterval(), signal);
  }
}

function nextInterval(): number {
  return document.visibilityState === 'visible' ? VISIBLE_INTERVAL_MS : HIDDEN_INTERVAL_MS;
}

/**
 * Reparte la espera al azar entre la mitad y el total: si la API se reinicia, los navegadores
 * no vuelven todos en el mismo instante, cada uno pidiendo además los datos de su pantalla.
 */
export function spread(delay: number, random: () => number = Math.random): number {
  return delay / 2 + random() * (delay / 2);
}

/** Espera `ms`, o menos si la pestaña vuelve a estar a la vista o se aborta la señal. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') done();
    };
    const timer = setTimeout(done, ms);
    document.addEventListener('visibilitychange', onVisibilityChange);
    signal.addEventListener('abort', done, { once: true });
  });
}
