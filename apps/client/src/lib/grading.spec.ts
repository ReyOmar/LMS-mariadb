import {
  toScore,
  scoreColor,
  isPassing,
  formatScore,
  formatPoints,
  DEFAULT_PASSING_SCORE,
  percent,
  averageScore,
} from './grading';

/**
 * Escala de calificación.
 *
 * Todo el campus puntúa sobre 100 y se aprueba con 80. Es justo el sitio donde un error no
 * se ve: una nota mal formateada se lee como una nota válida.
 *
 * Importa además que las notas lleguen de la API como **cadenas** —Prisma serializa los
 * decimales así—, de modo que cada función tiene que aguantarlo.
 */

describe('toScore', () => {
  it('acepta números y las cadenas que manda la API', () => {
    expect(toScore(85)).toBe(85);
    expect(toScore('85')).toBe(85);
    expect(toScore('87.5')).toBe(87.5);
    expect(toScore(0)).toBe(0);
  });

  it('distingue «sin nota» de «cero»', () => {
    expect(toScore(null)).toBeNull();
    expect(toScore(undefined)).toBeNull();
    expect(toScore('')).toBeNull();
    expect(toScore(0)).toBe(0);
  });

  it('descarta lo que no es un número', () => {
    expect(toScore('aprobado')).toBeNull();
    expect(toScore(Infinity)).toBeNull();
    expect(toScore(NaN)).toBeNull();
  });
});

describe('isPassing', () => {
  it('aprueba justo en el umbral', () => {
    expect(isPassing(80)).toBe(true);
    expect(isPassing(79.9)).toBe(false);
  });

  it('respeta el umbral del curso cuando lo hay', () => {
    expect(isPassing(70, 70)).toBe(true);
    expect(isPassing(70, 90)).toBe(false);
  });

  it('sin nota no es aprobado', () => {
    expect(isPassing(null)).toBe(false);
    expect(isPassing('')).toBe(false);
  });

  it('usa 80 por defecto', () => {
    expect(DEFAULT_PASSING_SCORE).toBe(80);
  });
});

describe('formateo', () => {
  it('enseña los enteros sin decimales y los demás con uno', () => {
    expect(formatPoints(85)).toBe('85');
    expect(formatPoints('87.5')).toBe('87.5');
    expect(formatPoints(87.44)).toBe('87.4');
    expect(formatPoints(87.46)).toBe('87.5');
  });

  it('el medio punto exacto se queda abajo, como hace `toFixed`', () => {
    // 87.55 no es representable en binario y cae justo por debajo, así que redondea a
    // 87.5. Queda escrito para que nadie lo tome por un fallo: las notas del sistema salen
    // de contar aciertos y no llegan a este caso.
    expect(formatPoints(87.55)).toBe('87.5');
  });

  it('marca la ausencia de nota en lugar de enseñar un cero', () => {
    expect(formatPoints(null)).toBe('—');
    expect(formatScore(null, 'COLOMBIA')).toBe('Sin calificar');
    expect(formatScore(0, 'COLOMBIA')).toBe('0 / 100');
  });

  it('la nota completa lleva su escala y los decimales de la sede', () => {
    expect(formatScore(85, 'MEXICO')).toBe('85 / 100');
    expect(formatScore(83.2, 'COLOMBIA')).toBe('83,2 / 100');
    expect(formatScore(83.2, 'MEXICO')).toBe('83.2 / 100');
  });
});

describe('percent', () => {
  it('redondea a entero', () => {
    expect(percent(87.4)).toBe(87);
    expect(percent(87.6)).toBe(88);
  });

  it('nunca sale de 0–100, pase lo que pase con el dato', () => {
    expect(percent(-10)).toBe(0);
    expect(percent(140)).toBe(100);
    expect(percent(null)).toBe(0);
  });
});

describe('scoreColor', () => {
  it('verde al aprobar, ámbar cerca y rojo lejos', () => {
    expect(scoreColor(80)).toContain('emerald');
    expect(scoreColor(65)).toContain('amber');
    expect(scoreColor(40)).toContain('red');
  });

  it('sin nota no pinta ni aprobado ni suspenso', () => {
    expect(scoreColor(null)).toBe('text-muted-foreground');
  });

  it('los tramos se mueven con el umbral del curso', () => {
    // Con umbral 60, un 45 ya está en la franja ámbar (75 % de 60).
    expect(scoreColor(45, 60)).toContain('amber');
    expect(scoreColor(44, 60)).toContain('red');
  });
});

describe('averageScore', () => {
  it('promedia sólo las notas que existen', () => {
    expect(averageScore([80, null, 100, undefined])).toBe(90);
  });

  it('cuenta un cero como nota, no como ausencia de nota', () => {
    expect(averageScore([0, 100])).toBe(50);
  });

  it('acepta las notas en forma de cadena, como las serializa la API', () => {
    expect(averageScore(['70.5', '89.5'])).toBe(80);
  });

  it('sin ninguna nota no hay media', () => {
    expect(averageScore([])).toBeNull();
    expect(averageScore([null, null])).toBeNull();
  });
});
