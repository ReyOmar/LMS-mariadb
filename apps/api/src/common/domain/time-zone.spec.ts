import { timeZoneOffset, dayInTimeZone, monthStart, currentMonthStart } from './time-zone';

describe('zona horaria de la sede', () => {
  const instant = new Date('2026-09-23T04:30:00Z');

  it('da el desfase de cada sede', () => {
    expect(timeZoneOffset('America/Bogota', instant)).toBe('-05:00');
    expect(timeZoneOffset('America/Mexico_City', instant)).toBe('-06:00');
    expect(timeZoneOffset('UTC', instant)).toBe('+00:00');
    expect(timeZoneOffset('Asia/Kolkata', instant)).toBe('+05:30');
  });

  it('con una zona inválida usa la del servidor en vez de fallar', () => {
    expect(timeZoneOffset('Zona/Inventada', instant)).toMatch(/^[+-]\d{2}:\d{2}$/);
  });

  it('el mismo instante cae en días distintos según la sede', () => {
    // 04:30 UTC son las 23:30 del día anterior en Bogotá y las 22:30 en Ciudad de México.
    expect(dayInTimeZone(instant, 'UTC')).toBe('2026-09-23');
    expect(dayInTimeZone(instant, 'America/Bogota')).toBe('2026-09-22');
    expect(dayInTimeZone(instant, 'America/Mexico_City')).toBe('2026-09-22');
  });
});

describe('inicio de mes en la sede', () => {
  it('es la medianoche del día 1 en la hora de la sede, no en UTC', () => {
    expect(monthStart(2026, 10, 'America/Bogota').toISOString()).toBe('2026-11-01T05:00:00.000Z');
    expect(monthStart(2026, 10, 'America/Mexico_City').toISOString()).toBe('2026-11-01T06:00:00.000Z');
  });

  it('el mes 12 es enero del año siguiente', () => {
    expect(monthStart(2026, 12, 'America/Bogota').toISOString()).toBe('2027-01-01T05:00:00.000Z');
  });

  it('el mes en curso es el de la sede: el 1 a las 02:00 UTC aún es el mes anterior en Bogotá', () => {
    const lateOnOctober31 = new Date('2026-11-01T02:00:00Z');
    expect(currentMonthStart('America/Bogota', lateOnOctober31).toISOString()).toBe('2026-10-01T05:00:00.000Z');
    expect(currentMonthStart('UTC', lateOnOctober31).toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });
});
