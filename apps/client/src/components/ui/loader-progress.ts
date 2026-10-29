/**
 * Avance de la barra de las pantallas de carga.
 *
 * La barra no conoce el progreso real de una petición: sólo sabe cuánto lleva esperando.
 * Todo su comportamiento se reduce a tres compromisos:
 *
 *  - Mientras se espera, siempre avanza —deprisa al principio y cada vez más despacio— y
 *    nunca llega a 100. El 100 significa «terminado»: enseñarlo antes es mentir, y una
 *    barra clavada es lo que hace pensar que la pantalla se colgó.
 *  - Cuando la carga termina, la barra se completa hasta 100 a la vista y después se va.
 *    Si desapareciera sin más, se esfumaría en una cifra cualquiera.
 *  - Varias pantallas de carga seguidas (la ruta, la sesión, los datos) son una sola espera
 *    para el usuario: la barra sigue donde estaba en lugar de volver a cero en cada una.
 *
 * Aquí sólo hay cálculo y estado, sin React ni DOM, para poder comprobarlo en pruebas.
 */

/**
 * Antes de esto no se enseña nada.
 *
 * Una carga que termina antes no necesita indicador: pintarlo sólo produciría un destello.
 * Si llega a verse, es porque de verdad hay algo que esperar.
 */
export const SHOW_DELAY_MS = 150;

/** Con cuánto arranca la barra: nunca se queda en cero. */
export const HEAD_START = 8;

/** Techo al que se acerca la barra mientras espera. El 100 queda para cuando termina. */
export const WAITING_CAP = 99;

/** A los 1,2 s la barra ha recorrido la mitad del camino entre el arranque y el techo. */
const HALF_WAY_MS = 1200;

/**
 * Margen para enlazar dos pantallas de carga seguidas cuando la primera no deja una
 * animación de cierre: con movimiento reducido, o porque todavía no había llegado a verse.
 * Una pantalla que sustituye a otra lo hace en el mismo instante o pocos milisegundos después.
 */
const HANDOFF_WINDOW_MS = 50;

/**
 * Cuánto avance mostrar tras un tiempo de espera.
 *
 * Crece deprisa al principio y se frena después sin detenerse nunca del todo: a los 10 s
 * sigue avanzando cerca de un punto por segundo. Nunca alcanza el techo.
 */
export function progressAt(elapsed: number): number {
  if (!(elapsed > 0)) return HEAD_START;
  const ratio = Number.isFinite(elapsed) ? elapsed / (elapsed + HALF_WAY_MS) : 1;
  return HEAD_START + (WAITING_CAP - HEAD_START) * ratio;
}

/** Inversa de `progressAt`: cuánto tiempo de espera corresponde a una cifra. */
export function elapsedFor(progress: number): number {
  if (!(progress > HEAD_START)) return 0;
  if (progress >= WAITING_CAP) return Number.POSITIVE_INFINITY;
  return (HALF_WAY_MS * (progress - HEAD_START)) / (WAITING_CAP - progress);
}

/** Cada cuánto se recalcula la cifra mientras se espera. */
function tickInterval(reducedMotion: boolean): number {
  // Con movimiento reducido la barra avanza a saltos, sin transición: mejor pocos.
  return reducedMotion ? 500 : 100;
}

/** Tiempos del cierre: subida hasta 100, pausa en 100 y desvanecimiento. */
export interface FinishTiming {
  fill: number;
  hold: number;
  fade: number;
}

export function finishTiming(reducedMotion: boolean): FinishTiming {
  // Sin animación la barra salta a 100 y se retira tras un instante, sin fundido.
  return reducedMotion ? { fill: 0, hold: 300, fade: 0 } : { fill: 240, hold: 100, fade: 200 };
}

export function finishDuration(timing: FinishTiming): number {
  return timing.fill + timing.hold + timing.fade;
}

/** La misma curva que usa la animación de cierre (`easeOutCubic`). */
export const FINISH_EASING = 'cubic-bezier(0.33, 1, 0.68, 1)';

/** Qué cifra enseña la barra durante el cierre, que parte de `from` y llega a 100. */
export function finishingProgressAt(from: number, elapsed: number, timing: FinishTiming): number {
  if (timing.fill <= 0 || elapsed >= timing.fill) return 100;
  if (!(elapsed > 0)) return from;
  const x = elapsed / timing.fill;
  return from + (100 - from) * (1 - (1 - x) ** 3);
}

/** Puntos suspensivos tipográficos, para que todos los mensajes se vean igual. */
export function loaderMessage(message: string): string {
  return message.replace(/\.{3}$/, '…');
}

/** Rectángulo en coordenadas de la ventana. */
export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Lo que deja una pantalla de carga al desaparecer, para que la capa de cierre ocupe su
 * lugar sin que se note el relevo.
 */
export interface LoaderHandoff {
  /** Cifra que enseñaba la barra en ese momento. */
  shown: number;
  /** Opacidad del indicador, que puede estar todavía apareciendo. */
  opacity: number;
  message: string;
  /** Región que ocupaba la carga, y que se cubre mientras la barra se completa. */
  area: Box;
  radius: string;
  /** Fondos de esa región, del más externo al más interno, para cubrirla con el mismo color. */
  backgrounds: string[];
  /** Caja del indicador, para pintarlo exactamente donde estaba. */
  box: Box;
}

export interface LoaderFinish {
  id: number;
  from: number;
  timing: FinishTiming;
  handoff: LoaderHandoff;
}

export type LoaderPhase = 'idle' | 'loading' | 'finishing';

export interface LoaderSnapshot {
  phase: LoaderPhase;
  /** Si la espera ya superó el margen inicial y el indicador se ve. */
  visible: boolean;
  progress: number;
  finish: LoaderFinish | null;
}

export const IDLE_SNAPSHOT: LoaderSnapshot = Object.freeze({
  phase: 'idle',
  visible: false,
  progress: 0,
  finish: null,
});

export interface LoaderEnvironment {
  now(): number;
  reducedMotion(): boolean;
}

const browserEnvironment: LoaderEnvironment = {
  now: () => Date.now(),
  reducedMotion: () =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
};

/**
 * Espera en curso, compartida por todas las pantallas de carga.
 *
 * Cada indicador avisa al aparecer (`start`) y al irse (`stop`). Mientras quede alguno,
 * la espera continúa; cuando se va el último, empieza el cierre, que pinta la capa de la
 * plantilla principal porque el indicador ya no existe.
 */
export class LoaderSession {
  private active = 0;
  private startedAt = 0;
  private finishedAt = 0;
  /** Cuándo se fue la última pantalla de carga que no había llegado a verse. */
  private hiddenStopAt = Number.NEGATIVE_INFINITY;
  private finishes = 0;
  private showTimer: ReturnType<typeof setTimeout> | undefined;
  private tickTimer: ReturnType<typeof setInterval> | undefined;
  private endTimer: ReturnType<typeof setTimeout> | undefined;
  private snapshot: LoaderSnapshot = IDLE_SNAPSHOT;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly env: LoaderEnvironment = browserEnvironment) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): LoaderSnapshot => this.snapshot;

  /** Aparece una pantalla de carga. */
  start(): void {
    this.active += 1;
    if (this.active > 1) return;

    const now = this.env.now();
    const finish = this.snapshot.finish;

    if (this.snapshot.phase === 'finishing' && finish) {
      clearTimeout(this.endTimer);
      this.endTimer = undefined;

      const elapsed = now - this.finishedAt;
      if (elapsed < finish.timing.fill || elapsed < HANDOFF_WINDOW_MS) {
        // Otra pantalla toma el relevo antes de que la barra llegue a 100: es la misma
        // espera y la barra sigue desde donde iba.
        const shown =
          elapsed < finish.timing.fill ? finishingProgressAt(finish.from, elapsed, finish.timing) : finish.from;
        this.startedAt = now - elapsedFor(Math.min(shown, WAITING_CAP - 1));
      } else {
        // La barra ya llegó a 100: es otra espera y empieza de nuevo, pero ya a la vista,
        // porque el usuario estaba mirando un indicador.
        this.startedAt = now;
      }
      this.beginTicking();
      this.update({ phase: 'loading', visible: true, progress: progressAt(now - this.startedAt), finish: null });
      return;
    }

    // Si releva a una pantalla que aún no se veía, es la misma espera: el margen inicial no
    // vuelve a empezar y el indicador aparece cuando le tocaba a la primera.
    if (now - this.hiddenStopAt >= HANDOFF_WINDOW_MS) this.startedAt = now;
    this.showTimer = setTimeout(() => this.show(), Math.max(0, SHOW_DELAY_MS - (now - this.startedAt)));
    this.update({ phase: 'loading', visible: false, progress: HEAD_START, finish: null });
  }

  /**
   * Se va una pantalla de carga.
   *
   * `describe` sólo se llama si hace falta cerrar a la vista: cuando se va la última y el
   * indicador llegó a verse.
   */
  stop(describe?: () => LoaderHandoff | null): void {
    if (this.active === 0) return;
    this.active -= 1;
    if (this.active > 0) return;

    const wasVisible = this.snapshot.visible;
    this.stopLoadingTimers();

    let handoff: LoaderHandoff | null = null;
    if (wasVisible && describe) {
      try {
        handoff = describe();
      } catch {
        handoff = null;
      }
    }

    if (!handoff) {
      this.hiddenStopAt = wasVisible ? Number.NEGATIVE_INFINITY : this.env.now();
      this.update(IDLE_SNAPSHOT);
      return;
    }

    const timing = finishTiming(this.env.reducedMotion());
    this.finishedAt = this.env.now();
    this.finishes += 1;
    this.endTimer = setTimeout(() => {
      this.endTimer = undefined;
      this.update(IDLE_SNAPSHOT);
    }, finishDuration(timing));

    // `progress` se queda en la cifra de partida: la subida a 100 la anima la capa de cierre,
    // y un indicador que apareciera ahora para retomar la espera debe partir de ahí.
    const from = clamp(handoff.shown, 0, 100);
    this.update({
      phase: 'finishing',
      visible: true,
      progress: from,
      finish: { id: this.finishes, from, timing, handoff },
    });
  }

  private show(): void {
    this.showTimer = undefined;
    this.beginTicking();
    this.update({ ...this.snapshot, visible: true, progress: progressAt(this.env.now() - this.startedAt) });
  }

  private beginTicking(): void {
    clearInterval(this.tickTimer);
    // Un intervalo y no `requestAnimationFrame`: éste se detiene con la pestaña en segundo
    // plano y la cifra se quedaría quieta. Diez veces por segundo basta; la transición CSS
    // de la barra suaviza el resto.
    this.tickTimer = setInterval(() => {
      this.update({ ...this.snapshot, progress: progressAt(this.env.now() - this.startedAt) });
    }, tickInterval(this.env.reducedMotion()));
  }

  private stopLoadingTimers(): void {
    clearTimeout(this.showTimer);
    clearInterval(this.tickTimer);
    this.showTimer = undefined;
    this.tickTimer = undefined;
  }

  private update(next: LoaderSnapshot): void {
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

/** La espera de toda la aplicación: hay una sola barra a la vista en cada momento. */
export const loaderSession = new LoaderSession();
