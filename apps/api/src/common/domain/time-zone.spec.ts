import { timeZoneOffset, dayInTimeZone } from './time-zone';

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
