import { Prisma } from '@prisma/client';
import { serializeJson } from './json';

describe('serializeJson', () => {
  it('las notas y las horas salen como número, estén donde estén', () => {
    const payload = {
      passingScore: new Prisma.Decimal('80.00'),
      submissions: [{ score: new Prisma.Decimal('87.5') }, { score: null }],
      certificate: { totalHours: new Prisma.Decimal('12') },
    };

    expect(JSON.parse(serializeJson(payload))).toEqual({
      passingScore: 80,
      submissions: [{ score: 87.5 }, { score: null }],
      certificate: { totalHours: 12 },
    });
  });

  it('el resto se serializa como siempre', () => {
    const payload = { title: '80', at: new Date(0), list: [1, 'dos'], empty: undefined };

    expect(serializeJson(payload)).toBe(JSON.stringify(payload));
    expect(serializeJson(new Prisma.Decimal('5'))).toBe('5');
  });
});
