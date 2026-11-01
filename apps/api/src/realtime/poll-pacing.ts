import { performance } from 'node:perf_hooks';

/** Espera entre dos consultas de una pestaña a la vista, con poca gente y el proceso desahogado. */
const BASE_INTERVAL_MS = 4_000;

/** La espera más larga que se pide: la misma de una pestaña en segundo plano. */
const MAX_INTERVAL_MS = 30_000;

/**
 * Consultas por segundo que se reservan para el tiempo real: la mitad de las que atendió el proceso
 * en las pruebas de carga a través de Apache (unas 700), para que las páginas, las entregas y los
 * picos tengan sitio.
 */
const POLLS_PER_SECOND = 350;

/**
 * Por encima de esta parte del tiempo ocupado se espacian las consultas, y por debajo de la otra se
 * vuelven a acercar. Entre las dos no se toca nada, para que la espera no oscile. La de calma deja
 * holgura: con el bucle ocupado más de un 70 % del tiempo, las respuestas empiezan a hacer cola.
 */
const BUSY_SHARE = 0.85;
const CALM_SHARE = 0.7;

/**
 * Cuánto se espacian o se acercan en cada medición. Se suelta al mismo paso que se frena: lo que más
 * pesa en un pico —las entradas y las páginas— no depende del tiempo real y pasa pronto, así que tras
 * él las consultas recuperan su ritmo en un minuto.
 */
const STEP = 1.5;

/** Parte del tiempo que el proceso pasó ocupado desde la medición anterior, entre 0 y 1. */
export type BusyShare = () => number;

/** Lo ocupado que estuvo el bucle de eventos de Node: el tiempo que no pudo atender nada nuevo. */
function eventLoopBusyShare(): BusyShare {
  let last = performance.eventLoopUtilization();
  return () => {
    const current = performance.eventLoopUtilization();
    const share = performance.eventLoopUtilization(current, last).utilization;
    last = current;
    return share;
  };
}

/**
 * Cuánto debe esperar cada pestaña antes de volver a preguntar. Dos cosas espacian las consultas:
 * la gente conectada, para que el total no pase de las reservadas, y lo ocupado que esté el proceso,
 * medido, que cubre lo que el número de gente no sabe: varias pestañas por persona, un servidor más
 * lento, un informe pesado, una ráfaga de entregas. Con el proceso saturado, los avisos tardan algo
 * más en llegar, pero el campus sigue respondiendo.
 */
export class PollPacing {
  /** Cuánto se multiplica la espera de base por la carga medida. */
  private loadFactor = 1;

  constructor(private readonly busyShare: BusyShare = eventLoopBusyShare()) {}

  /** Mide lo ocupado que estuvo el proceso desde la medición anterior y, si hace falta, ajusta la espera. */
  measure(): void {
    const share = this.busyShare();
    if (share > BUSY_SHARE) this.loadFactor = Math.min(MAX_INTERVAL_MS / BASE_INTERVAL_MS, this.loadFactor * STEP);
    else if (share < CALM_SHARE) this.loadFactor = Math.max(1, this.loadFactor / STEP);
  }

  /** La espera para quien pregunta ahora, en segundos enteros, con `visitors` conectados. */
  interval(visitors: number): number {
    const byCrowd = (visitors / POLLS_PER_SECOND) * 1000;
    const byLoad = BASE_INTERVAL_MS * this.loadFactor;
    return Math.min(MAX_INTERVAL_MS, Math.ceil(Math.max(byCrowd, byLoad) / 1000) * 1000);
  }
}
