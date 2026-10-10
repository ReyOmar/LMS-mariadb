import { Reflector } from '@nestjs/core';
import { ThrottlerException, ThrottlerStorageService } from '@nestjs/throttler';
import type { ExecutionContext } from '@nestjs/common';
import { RATE_LIMITS, RateLimitGuard } from './rate-limit.guard';
import { sessionFor } from '../testing/test-campus';

/**
 * A quién se cuenta en el límite de peticiones.
 *
 * Una oficina o un aula comparten IP pública: con sesión se cuenta a cada persona, y en las
 * peticiones que llevan un correo los intentos sobre esa cuenta se cuentan aparte, haya
 * sesión o no.
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
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({ header: () => undefined }) }),
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

  it('el contador por cuenta actúa en toda petición que lleva un correo, con sesión o sin ella', () => {
    const accountLimit = RATE_LIMITS.throttlers.find((throttler) => throttler.name === 'account');
    const skipped = (request: Request) => accountLimit?.skipIf?.(contextFor(request));

    expect(skipped({ ...officeIp, body: { email: 'ana@empresa.com' } })).toBe(false);
    expect(skipped({ ...officeIp, body: {} })).toBe(true);
    expect(
      skipped({ ...officeIp, body: { email: 'ana@empresa.com' }, user: sessionFor('STUDENT', 'COLOMBIA', 'luis') }),
    ).toBe(false);
  });

  it('un token válido no salta el tope de intentos sobre una cuenta ajena', async () => {
    const limited = new RateLimitGuard(RATE_LIMITS, new ThrottlerStorageService(), new Reflector());
    await limited.onModuleInit();
    // Las rutas públicas aceptan el token si viene, y entonces se cuenta por usuario.
    const attempt = () =>
      limited.canActivate(
        contextFor({
          ...officeIp,
          user: sessionFor('STUDENT', 'COLOMBIA', 'luis'),
          body: { email: 'ana@empresa.com' },
        }),
      );

    for (let i = 0; i < 5; i++) await expect(attempt()).resolves.toBe(true);
    await expect(attempt()).rejects.toBeInstanceOf(ThrottlerException);
  });

  it('con sesión el tope también va por correo: dar de alta a varias personas no lo agota', () => {
    const admin = { ...officeIp, user: sessionFor('ADMIN', 'COLOMBIA', 'admin') };
    const creation = (email: string) => guard.key({ ...admin, body: { email } }, 'user:admin', 'account');

    expect(creation('ana@empresa.com')).not.toBe(creation('luis@empresa.com'));
  });
});
