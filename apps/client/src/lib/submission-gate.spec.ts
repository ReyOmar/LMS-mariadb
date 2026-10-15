import { AxiosError, AxiosHeaders } from 'axios';
import { SubmissionGate, formatCountdown } from './submission-gate';

function httpFailure(status: number, headers: Record<string, string> = {}) {
  const config = { headers: new AxiosHeaders() };
  const response = { status, statusText: '', data: {}, headers, config };
  return new AxiosError('', 'ERR_BAD_REQUEST', config, null, response);
}

/** Reloj que sólo avanza cuando la prueba lo pide. */
function manualClock(start = 0) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe('SubmissionGate', () => {
  it('envía cuando no hay nada en curso ni espera pendiente', async () => {
    const gate = new SubmissionGate();
    const request = jest.fn().mockResolvedValue(undefined);

    await expect(gate.pass(request)).resolves.toEqual({ status: 'sent' });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('un doble clic no envía dos veces: el segundo llega con el primero en curso', async () => {
    const gate = new SubmissionGate();
    let finish = () => {};
    const request = jest.fn(() => new Promise<void>((resolve) => (finish = resolve)));

    const first = gate.pass(request);
    const second = gate.pass(request);

    await expect(second).resolves.toEqual({ status: 'skipped' });
    finish();
    await expect(first).resolves.toEqual({ status: 'sent' });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('tras un 429 no hace ninguna petición hasta que pasa el Retry-After', async () => {
    const clock = manualClock();
    const gate = new SubmissionGate(clock.now);
    const rejected = jest.fn().mockRejectedValue(httpFailure(429, { 'retry-after': '42' }));

    await expect(gate.pass(rejected)).resolves.toMatchObject({ status: 'failed', retryAfterSeconds: 42 });

    const retry = jest.fn().mockResolvedValue(undefined);
    clock.advance(41_999);
    expect(gate.isOpen()).toBe(false);
    await expect(gate.pass(retry)).resolves.toEqual({ status: 'skipped' });
    expect(retry).not.toHaveBeenCalled();

    clock.advance(1);
    expect(gate.isOpen()).toBe(true);
    await expect(gate.pass(retry)).resolves.toEqual({ status: 'sent' });
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('cualquier otro fallo deja volver a intentarlo al momento', async () => {
    const gate = new SubmissionGate(manualClock().now);
    const failure = httpFailure(401);

    await expect(gate.pass(() => Promise.reject(failure))).resolves.toEqual({
      status: 'failed',
      failure,
      retryAfterSeconds: 0,
    });
    expect(gate.isOpen()).toBe(true);
  });
});

describe('formatCountdown', () => {
  it('escribe minutos y segundos como un reloj', () => {
    expect(formatCountdown(42)).toBe('0:42');
    expect(formatCountdown(65)).toBe('1:05');
    expect(formatCountdown(600)).toBe('10:00');
  });

  it('redondea hacia arriba y nunca baja de cero', () => {
    expect(formatCountdown(0.2)).toBe('0:01');
    expect(formatCountdown(-3)).toBe('0:00');
  });
});
