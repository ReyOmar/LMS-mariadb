import { Reflector } from '@nestjs/core';
import { ThrottlerStorageService } from '@nestjs/throttler';
import type { ExecutionContext } from '@nestjs/common';
import { RATE_LIMITS, RateLimitGuard } from './rate-limit.guard';
import { sessionFor } from '../testing/test-campus';

/**
 * A quién se cuenta en el límite de peticiones.
 *
 * Una oficina o un aula comparten IP pública: con sesión se cuenta a cada persona, y en los
 * formularios sin sesión los intentos sobre una cuenta se cuentan aparte de los de la IP.
 */

type Request = Record<string, unknown>;

class InspectableGuard extends RateLimitGuard {
  tracker(request: Request) {
    return this.getTracker(request);
  }
  key(request: Request, tracker: string, throttler: string) {
    return this.generateKey(contextFor(request), tracker, throttler);
  }
  headersWritten(name: string, value: number) {
    const headers: Record<string, unknown> = {};
    this.setResponseHeader({ header: (header: string, written: unknown) => (headers[header] = written) }, name, value);
    return headers;
  }
}

function contextFor(request: Request): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getClass: () => class AuthController {},
    getHandler: () => function login() {},
  } as unknown as ExecutionContext;
}

describe('RateLimitGuard', () => {
  const guard = new InspectableGuard(RATE_LIMITS, new ThrottlerStorageService(), new Reflector());
  const officeIp = { ip: '203.0.113.7' };

  it('con sesión cuenta a la persona, aunque comparta IP con otras', async () => {
    const ana = await guard.tracker({ ...officeIp, user: sessionFor('STUDENT', 'COLOMBIA', 'ana') });
    const luis = await guard.tracker({ ...officeIp, user: sessionFor('STUDENT', 'COLOMBIA', 'luis') });

    expect(ana).toBe('user:ana');
    expect(ana).not.toBe(luis);
  });

  it('sin sesión cuenta la IP', async () => {
    expect(await guard.tracker(officeIp)).toBe('ip:203.0.113.7');
  });

  it('los intentos sobre una cuenta se cuentan por correo, sin distinguir mayúsculas', () => {
    const attempt = (email: string) => guard.key({ ...officeIp, body: { email } }, 'ip:203.0.113.7', 'account');

    expect(attempt('Ana@Empresa.com ')).toBe(attempt('ana@empresa.com'));
    expect(attempt('ana@empresa.com')).not.toBe(attempt('luis@empresa.com'));
  });

  it('el límite general de la IP no depende del correo escrito', () => {
    const attempt = (email: string) => guard.key({ ...officeIp, body: { email } }, 'ip:203.0.113.7', 'default');

    expect(attempt('ana@empresa.com')).toBe(attempt('luis@empresa.com'));
  });

  it('la espera se anuncia en Retry-After aunque bloquee el contador por cuenta', () => {
    expect(guard.headersWritten('Retry-After-account', 42)).toEqual({ 'Retry-After': 42 });
    expect(guard.headersWritten('Retry-After', 7)).toEqual({ 'Retry-After': 7 });
    expect(guard.headersWritten('X-RateLimit-Limit', 5)).toEqual({ 'X-RateLimit-Limit': 5 });
  });

  it('el contador por cuenta sólo actúa en peticiones sin sesión que llevan un correo', () => {
    const accountLimit = RATE_LIMITS.throttlers.find((throttler) => throttler.name === 'account');
    const skipped = (request: Request) => accountLimit?.skipIf?.(contextFor(request));

    expect(skipped({ ...officeIp, body: { email: 'ana@empresa.com' } })).toBe(false);
    expect(skipped({ ...officeIp, body: {} })).toBe(true);
    expect(
      skipped({ ...officeIp, body: { email: 'nuevo@empresa.com' }, user: sessionFor('ADMIN', 'COLOMBIA', 'admin') }),
    ).toBe(true);
  });
});
