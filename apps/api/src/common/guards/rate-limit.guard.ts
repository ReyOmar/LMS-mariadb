import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerModuleOptions } from '@nestjs/throttler';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';

const MINUTE_MS = 60_000;

/** Contador de intentos sobre una misma cuenta: el correo escrito en un formulario público. */
const ACCOUNT = 'account';

const RETRY_AFTER = 'Retry-After';

/**
 * Límites de peticiones del campus. Hay dos contadores:
 *
 *  - `default`, lo que pide cada persona. Con sesión se cuenta por usuario y sin ella por
 *    IP: una oficina o un aula navegan tras la misma IP pública, y contarlas como una sola
 *    persona las bloquearía en cuanto unos pocos trabajaran a la vez.
 *  - `account`, los intentos sobre un mismo correo desde una misma IP en los formularios
 *    sin sesión. Es lo que frena adivinar contraseñas o códigos, y permite que el límite
 *    por IP de esos formularios sea holgado para que un aula entera pueda entrar a la vez.
 */
export const RATE_LIMITS = {
  throttlers: [
    { name: 'default', ttl: MINUTE_MS, limit: 120 },
    { name: ACCOUNT, ttl: MINUTE_MS, limit: 5, skipIf: (context) => attemptedAccount(context) === null },
  ],
  errorMessage: 'Has hecho demasiadas peticiones seguidas. Espera un minuto e inténtalo de nuevo.',
} satisfies ThrottlerModuleOptions;

/** Formularios que comprueban un secreto: contraseña, contraseña temporal, código o enlace. */
export const CREDENTIALS_LIMIT = { default: { ttl: MINUTE_MS, limit: 30 } };

/** Formularios que envían un correo: además de la IP, se limita lo que recibe cada buzón. */
export const EMAIL_LIMIT = {
  default: { ttl: MINUTE_MS, limit: 10 },
  [ACCOUNT]: { ttl: MINUTE_MS, limit: 3 },
};

type RequestWithUser = Record<string, unknown> & { user?: JwtPayload; body?: unknown };

/** El correo sobre el que actúa una petición sin sesión, normalizado, o `null` si no lleva. */
function attemptedAccount(context: ExecutionContext): string | null {
  const request = context.switchToHttp().getRequest<RequestWithUser>();
  if (request.user) return null;

  const email = (request.body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;
}

@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  protected async getTracker(request: RequestWithUser): Promise<string> {
    return request.user ? `user:${request.user.sub}` : `ip:${await super.getTracker(request)}`;
  }

  /**
   * El contador que bloquea dice cuánto esperar, pero la librería lo escribe como
   * `Retry-After-account` cuando es el de la cuenta. Se deja siempre en `Retry-After`, la
   * cabecera estándar que el navegador puede leer y con la que el formulario cuenta atrás.
   */
  protected setResponseHeader(response: Record<string, unknown>, name: string, value: string | number): void {
    super.setResponseHeader(response, name.startsWith(RETRY_AFTER) ? RETRY_AFTER : name, value);
  }

  protected generateKey(context: ExecutionContext, tracker: string, throttlerName: string): string {
    const subject = throttlerName === ACCOUNT ? `${tracker}|${attemptedAccount(context)}` : tracker;
    return super.generateKey(context, subject, throttlerName);
  }
}
