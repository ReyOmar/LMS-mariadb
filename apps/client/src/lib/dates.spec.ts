import { shortDate, longDate, dateTime, shortTime, conversationTimestamp, timeAgo } from './dates';

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
  it('de hoy enseña la hora', () => {
    const oneHourAgo = new Date(Date.now() - 3_600_000);
    expect(conversationTimestamp(oneHourAgo)).toMatch(/^\d{2}:\d{2}$/);
  });

  it('de esta semana enseña el día de la semana', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000);
    expect(conversationTimestamp(threeDaysAgo)).not.toMatch(/^\d{2}:\d{2}$/);
    expect(conversationTimestamp(threeDaysAgo).length).toBeLessThan(10);
  });

  it('más antigua enseña el día y el mes', () => {
    const oneMonthAgo = new Date(Date.now() - 30 * 86_400_000);
    expect(conversationTimestamp(oneMonthAgo)).toMatch(/\d{2}/);
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
