import {
  shortDate,
  longDate,
  dateTime,
  shortTime,
  conversationTimestamp,
  timeAgo,
  setTimeZone,
  calendarDay,
} from './dates';

/**
 * Cómo se leen las fechas en el campus.
 *
 * Importa sobre todo lo que pasa con lo que **no** es una fecha: la API devuelve nulos en
 * cuanto algo está sin hacer —sin último acceso, sin fecha de entrega— y una pantalla que
 * imprima «Invalid Date» queda rota a la vista de todos.
 */
describe('fechas del campus', () => {
  const DATE = '2026-09-22T14:05:00';

  it('la fecha corta lleva día, mes y año con dos cifras', () => {
    expect(shortDate(DATE)).toBe('22/09/2026');
  });

  it('la fecha larga escribe el mes con letras', () => {
    expect(longDate(DATE)).toContain('septiembre');
    expect(longDate(DATE)).toContain('2026');
  });

  it('fecha y hora lleva el día, el mes abreviado y la hora', () => {
    expect(dateTime(DATE)).toContain('22');
    expect(dateTime(DATE)).toContain('14:05');
  });

  it('la hora va en veinticuatro horas', () => {
    expect(shortTime(DATE)).toBe('14:05');
  });

  it('acepta tanto la cadena de la API como un Date', () => {
    expect(shortDate(new Date(DATE))).toBe(shortDate(DATE));
  });

  it.each([
    ['nulo', null],
    ['indefinido', undefined],
    ['vacío', ''],
    ['texto que no es fecha', 'ayer por la tarde'],
  ])('con un valor %s lo dice, en vez de imprimir «Invalid Date»', (_case, value) => {
    for (const format of [shortDate, longDate, dateTime, shortTime]) {
      expect(format(value)).toBe('Sin fecha');
    }
    // En el chat una marca vacía se lee mejor que una frase.
    expect(conversationTimestamp(value)).toBe('');
  });
});

describe('marca de conversación', () => {
  // 10:00 del 22 de septiembre en Bogotá.
  const now = Date.parse('2026-09-22T15:00:00Z');

  beforeEach(() => setTimeZone('America/Bogota'));
  afterEach(() => setTimeZone(undefined));

  it('de hoy enseña la hora de la sede', () => {
    expect(conversationTimestamp('2026-09-22T13:30:00Z', now)).toBe('08:30');
  });

  it('de ayer dice «ayer» aunque no hayan pasado 24 horas', () => {
    expect(conversationTimestamp('2026-09-21T23:00:00Z', now)).toBe('ayer');
    // Las 23:00 del 21 en Bogotá, cuando en UTC ya es día 22.
    expect(conversationTimestamp('2026-09-22T04:00:00Z', now)).toBe('ayer');
  });

  it('de esta semana enseña el día de la semana', () => {
    const text = conversationTimestamp('2026-09-19T15:00:00Z', now);
    expect(text).not.toMatch(/^\d{2}:\d{2}$/);
    expect(text).not.toBe('ayer');
    expect(text.length).toBeLessThan(10);
  });

  it('más antigua enseña el día y el mes', () => {
    expect(conversationTimestamp('2026-08-23T15:00:00Z', now)).toMatch(/23/);
  });

  it('cuenta los días en la sede: el mismo instante es hoy en Bogotá y ayer en Ciudad de México', () => {
    const instant = '2026-09-22T05:30:00Z';
    expect(conversationTimestamp(instant, now)).toBe('00:30');

    setTimeZone('America/Mexico_City');
    expect(conversationTimestamp(instant, now)).toBe('ayer');
  });
});

describe('zona horaria de la sede', () => {
  afterEach(() => setTimeZone(undefined));

  it('escribe la hora de la sede, no la del navegador', () => {
    setTimeZone('America/Bogota');
    expect(shortTime('2026-09-22T19:05:00Z')).toBe('14:05');
    expect(shortDate('2026-09-23T03:00:00Z')).toBe('22/09/2026');

    setTimeZone('America/Mexico_City');
    expect(shortTime('2026-09-22T19:05:00Z')).toBe('13:05');
  });

  it('una zona que no existe no rompe las fechas: se usa la del navegador', () => {
    setTimeZone('Marte/Olimpo');
    // Sin zona en la cadena se lee en la hora del navegador, y en esa misma se escribe.
    expect(shortTime('2026-09-22T14:05:00')).toBe('14:05');
  });

  it('el día del calendario es el de la sede', () => {
    setTimeZone('America/Bogota');
    expect(calendarDay(new Date('2026-10-01T03:00:00Z'))).toEqual({ year: 2026, month: 8, day: 30 });
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-09-21T12:00:00Z').getTime();
  const minutesAgo = (m: number) => new Date(now - m * 60_000).toISOString();

  it('distingue los tramos que le importan a quien mira', () => {
    expect(timeAgo(minutesAgo(0.5), now)).toBe('Hace un momento');
    expect(timeAgo(minutesAgo(3), now)).toBe('Hace 3 min');
    expect(timeAgo(minutesAgo(60 * 5), now)).toBe('Hace 5h');
    expect(timeAgo(minutesAgo(60 * 24 * 3), now)).toBe('Hace 3d');
  });

  it('pasada la semana enseña la fecha, que dice más que «hace 47d»', () => {
    const text = timeAgo(minutesAgo(60 * 24 * 47), now);
    expect(text).not.toMatch(/Hace/);
    expect(text).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it('«nunca entró» no es lo mismo que «entró hace mucho»', () => {
    expect(timeAgo(null, now)).toBeNull();
    expect(timeAgo(undefined, now)).toBeNull();
  });

  it('una fecha corrupta no imprime «Invalid Date» en pantalla', () => {
    expect(timeAgo('no es una fecha', now)).toBeNull();
  });
});
