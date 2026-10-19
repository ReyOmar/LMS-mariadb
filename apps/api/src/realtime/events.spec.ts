import { REALTIME_EVENTS } from './events';

// El cliente tiene su copia del catálogo: `client-mirrors.spec.ts` comprueba que coinciden.

describe('Catálogo de eventos en tiempo real', () => {
  it('no tiene nombres repetidos', () => {
    expect(new Set(REALTIME_EVENTS).size).toBe(REALTIME_EVENTS.length);
  });
});
