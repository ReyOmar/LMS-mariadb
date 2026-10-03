import {
  HEAD_START,
  LoaderSession,
  SHOW_DELAY_MS,
  WAITING_CAP,
  elapsedFor,
  finishDuration,
  finishTiming,
  finishingProgressAt,
  loaderMessage,
  progressAt,
  type LoaderHandoff,
} from './loader-progress';

/**
 * Avance de la barra de las pantallas de carga.
 *
 * Lo que se fija aquí es lo que el usuario percibe: que la barra nunca se queda en cero ni
 * clavada, que no llega a 100 mientras se sigue esperando, que al terminar sí se completa
 * a la vista, y que varias pantallas de carga seguidas no la devuelven al principio.
 */

describe('progressAt', () => {
  it('arranca con algo de avance, nunca en cero', () => {
    expect(progressAt(0)).toBe(HEAD_START);
    expect(HEAD_START).toBeGreaterThan(0);
  });

  it('avanza deprisa al principio, que es cuando se mira', () => {
    expect(progressAt(SHOW_DELAY_MS)).toBeGreaterThan(15);
    expect(progressAt(500)).toBeGreaterThan(30);
    expect(progressAt(1200)).toBeCloseTo((HEAD_START + WAITING_CAP) / 2, 5);
  });

  it('siempre sigue subiendo: no hay ningún tramo en que se detenga', () => {
    let previous = -1;
    for (let t = 0; t <= 60_000; t += 100) {
      const current = progressAt(t);
      expect(current).toBeGreaterThan(previous);
      previous = current;
    }
  });

  it('a los diez segundos todavía se nota que avanza', () => {
    // Más de medio punto en un segundo: unos píxeles visibles en la barra.
    expect(progressAt(11_000) - progressAt(10_000)).toBeGreaterThan(0.5);
  });

  it('nunca llega a 100 mientras se espera, por larga que sea la espera', () => {
    for (const delay of [5_000, 30_000, 5 * 60_000, Number.MAX_SAFE_INTEGER, Number.POSITIVE_INFINITY]) {
      expect(progressAt(delay)).toBeLessThan(100);
      expect(progressAt(delay)).toBeLessThanOrEqual(WAITING_CAP);
    }
  });

  it('no se descuadra si el reloj salta hacia atrás o no es un número', () => {
    expect(progressAt(-500)).toBe(HEAD_START);
    expect(progressAt(Number.NaN)).toBe(HEAD_START);
  });
});

describe('elapsedFor', () => {
  it('es la inversa de progressAt, para retomar la barra en la cifra en que estaba', () => {
    for (const t of [0, 100, 1_000, 5_000, 30_000]) {
      expect(progressAt(elapsedFor(progressAt(t)))).toBeCloseTo(progressAt(t), 6);
    }
  });

  it('por debajo del arranque equivale a no haber esperado nada', () => {
    expect(elapsedFor(0)).toBe(0);
    expect(elapsedFor(HEAD_START)).toBe(0);
  });
});

describe('cierre de la barra', () => {
  const timing = finishTiming(false);

  it('parte de donde estaba la barra y termina en 100', () => {
    expect(finishingProgressAt(37, 0, timing)).toBe(37);
    expect(finishingProgressAt(37, timing.fill, timing)).toBe(100);
    expect(finishingProgressAt(37, timing.fill * 10, timing)).toBe(100);
  });

  it('sube sin retroceder y sin saltar de golpe al final', () => {
    let previous = 37;
    for (let t = 0; t <= timing.fill; t += 10) {
      const current = finishingProgressAt(37, t, timing);
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
    // A mitad de la subida ya se ha recorrido buena parte, pero todavía no es 100.
    const halfway = finishingProgressAt(37, timing.fill / 2, timing);
    expect(halfway).toBeGreaterThan(37);
    expect(halfway).toBeLessThan(100);
  });

  it('se ve completa y se retira deprisa', () => {
    expect(timing.fill).toBeGreaterThanOrEqual(150);
    expect(timing.hold).toBeGreaterThan(0);
    expect(finishDuration(timing)).toBeLessThanOrEqual(600);
  });

  it('con movimiento reducido salta a 100 sin animación y se retira sin fundido', () => {
    const reduced = finishTiming(true);
    expect(reduced.fill).toBe(0);
    expect(reduced.fade).toBe(0);
    expect(reduced.hold).toBeGreaterThan(0);
    expect(finishingProgressAt(37, 0, reduced)).toBe(100);
  });
});

describe('loaderMessage', () => {
  it('usa puntos suspensivos tipográficos', () => {
    expect(loaderMessage('Cargando tus cursos...')).toBe('Cargando tus cursos…');
    expect(loaderMessage('Cargando campus…')).toBe('Cargando campus…');
    expect(loaderMessage('Redirigiendo')).toBe('Redirigiendo');
  });
});

describe('LoaderSession', () => {
  const box = { top: 0, left: 0, width: 400, height: 300 };
  const handoff = (shown: number): LoaderHandoff => ({
    shown,
    opacity: 1,
    message: 'Cargando…',
    area: box,
    radius: '',
    backgrounds: [],
    box,
  });

  let reducedMotion = false;
  let session: LoaderSession;

  beforeEach(() => {
    jest.useFakeTimers();
    reducedMotion = false;
    session = new LoaderSession({ now: () => Date.now(), reducedMotion: () => reducedMotion });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('una carga muy rápida no enseña nada: ni indicador ni cierre', () => {
    const measure = jest.fn(() => handoff(20));
    session.start();
    jest.advanceTimersByTime(SHOW_DELAY_MS - 50);
    expect(session.getSnapshot().visible).toBe(false);

    session.stop(measure);
    expect(measure).not.toHaveBeenCalled();
    expect(session.getSnapshot().phase).toBe('idle');
  });

  it('aparece tras la espera inicial y avanza sin detenerse', () => {
    session.start();
    jest.advanceTimersByTime(SHOW_DELAY_MS);
    const first = session.getSnapshot();
    expect(first.visible).toBe(true);
    expect(first.progress).toBeGreaterThan(HEAD_START);

    let previous = first.progress;
    for (let step = 0; step < 50; step += 1) {
      jest.advanceTimersByTime(200);
      const { progress } = session.getSnapshot();
      expect(progress).toBeGreaterThan(previous);
      expect(progress).toBeLessThan(100);
      previous = progress;
    }
  });

  it('al terminar la carga se completa hasta 100 desde donde estaba y desaparece', () => {
    session.start();
    jest.advanceTimersByTime(700);
    session.stop(() => handoff(42));

    const closing = session.getSnapshot();
    expect(closing.phase).toBe('finishing');
    expect(closing.finish?.from).toBe(42);
    expect(closing.progress).toBe(42);
    const timing = closing.finish!.timing;
    expect(finishingProgressAt(42, timing.fill, timing)).toBe(100);

    jest.advanceTimersByTime(finishDuration(finishTiming(false)) - 1);
    expect(session.getSnapshot().phase).toBe('finishing');
    jest.advanceTimersByTime(1);
    expect(session.getSnapshot()).toMatchObject({ phase: 'idle', visible: false, finish: null });
  });

  it('dos pantallas de carga seguidas son una sola espera: la barra no vuelve a cero', () => {
    session.start();
    jest.advanceTimersByTime(800);
    const before = session.getSnapshot().progress;

    // La ruta cede el paso a la pantalla en el mismo instante.
    session.stop(() => handoff(before));
    session.start();

    const after = session.getSnapshot();
    expect(after).toMatchObject({ phase: 'loading', visible: true, finish: null });
    expect(after.progress).toBeCloseTo(before, 1);

    jest.advanceTimersByTime(500);
    expect(session.getSnapshot().progress).toBeGreaterThan(before);
  });

  it('si releva a una pantalla que aún no se veía, el margen inicial no vuelve a empezar', () => {
    const measure = jest.fn(() => handoff(20));
    session.start();
    jest.advanceTimersByTime(SHOW_DELAY_MS - 50);

    // «Entrando al campus» cede el paso al panel antes de haberse visto.
    session.stop(measure);
    session.start();
    expect(measure).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toMatchObject({ phase: 'loading', visible: false });

    jest.advanceTimersByTime(50);
    const shown = session.getSnapshot();
    expect(shown.visible).toBe(true);
    expect(shown.progress).toBeCloseTo(progressAt(SHOW_DELAY_MS), 5);
  });

  it('dos cargas rápidas separadas por un rato son esperas distintas', () => {
    session.start();
    jest.advanceTimersByTime(SHOW_DELAY_MS - 50);
    session.stop();

    jest.advanceTimersByTime(200);
    session.start();
    jest.advanceTimersByTime(SHOW_DELAY_MS - 1);
    expect(session.getSnapshot().visible).toBe(false);
    jest.advanceTimersByTime(1);
    expect(session.getSnapshot()).toMatchObject({ visible: true, progress: progressAt(SHOW_DELAY_MS) });
  });

  it('si otra carga llega mientras la barra se completa, sigue desde donde iba, sin retroceder', () => {
    session.start();
    jest.advanceTimersByTime(600);
    session.stop(() => handoff(40));

    const timing = finishTiming(false);
    jest.advanceTimersByTime(timing.fill / 2);
    const shown = finishingProgressAt(40, timing.fill / 2, timing);
    session.start();

    const resumed = session.getSnapshot();
    expect(resumed.phase).toBe('loading');
    expect(resumed.progress).toBeGreaterThanOrEqual(Math.min(shown, WAITING_CAP - 1) - 0.01);
    expect(resumed.progress).toBeLessThan(100);
  });

  it('si la barra ya había llegado a 100, la carga nueva empieza de nuevo, ya a la vista', () => {
    session.start();
    jest.advanceTimersByTime(600);
    session.stop(() => handoff(40));

    jest.advanceTimersByTime(finishTiming(false).fill + 20);
    session.start();

    expect(session.getSnapshot()).toMatchObject({ phase: 'loading', visible: true, progress: HEAD_START });
  });

  it('con movimiento reducido también completa hasta 100 y no pierde el hilo entre pantallas', () => {
    reducedMotion = true;
    session.start();
    jest.advanceTimersByTime(900);
    const before = session.getSnapshot().progress;
    expect(before).toBeGreaterThan(HEAD_START);

    session.stop(() => handoff(before));
    expect(session.getSnapshot().finish?.timing.fill).toBe(0);
    session.start();
    expect(session.getSnapshot().progress).toBeCloseTo(before, 1);

    session.stop(() => handoff(before));
    jest.advanceTimersByTime(finishDuration(finishTiming(true)));
    expect(session.getSnapshot().phase).toBe('idle');
  });

  it('con varias pantallas a la vez, sólo cierra cuando se va la última', () => {
    session.start();
    session.start();
    jest.advanceTimersByTime(500);

    session.stop(() => handoff(30));
    expect(session.getSnapshot().phase).toBe('loading');

    session.stop(() => handoff(30));
    expect(session.getSnapshot().phase).toBe('finishing');
  });

  it('si no se puede medir el indicador, se retira sin capa de cierre', () => {
    session.start();
    jest.advanceTimersByTime(500);
    session.stop(() => null);
    expect(session.getSnapshot().phase).toBe('idle');

    session.start();
    jest.advanceTimersByTime(500);
    session.stop(() => {
      throw new Error('sin DOM');
    });
    expect(session.getSnapshot().phase).toBe('idle');
  });

  it('no se descuadra si se cierra más veces de las que se abrió', () => {
    session.stop();
    session.start();
    session.stop();
    session.stop();
    expect(session.getSnapshot().phase).toBe('idle');

    session.start();
    jest.advanceTimersByTime(SHOW_DELAY_MS);
    expect(session.getSnapshot()).toMatchObject({ phase: 'loading', visible: true });
  });

  it('avisa a quien escucha en cada cambio y deja de hacerlo al darse de baja', () => {
    const listener = jest.fn();
    const unsubscribe = session.subscribe(listener);
    session.start();
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    listener.mockClear();
    jest.advanceTimersByTime(1_000);
    expect(listener).not.toHaveBeenCalled();
  });
});
