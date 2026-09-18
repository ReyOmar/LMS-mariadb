import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Inyecta la identidad autenticada de la petición.
 *
 * Falla si no hay sesión en lugar de devolver `undefined`: un controlador protegido que
 * reciba `undefined` acabaría consultando con un `guid` vacío y devolviendo datos que no
 * corresponden. Las rutas `@Public()` que quieran leer al usuario opcionalmente deben
 * usar `@CurrentUserOptional()`.
 *
 * @example async getMisCursos(@CurrentUser() user: JwtPayload)
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): JwtPayload => {
  const user = ctx.switchToHttp().getRequest().user as JwtPayload | undefined;
  if (!user?.sub) {
    throw new UnauthorizedException('Sesión no válida. Vuelve a iniciar sesión.');
  }
  return user;
});

/** Igual que `@CurrentUser()` pero devuelve `null` en rutas públicas sin sesión. */
export const CurrentUserOptional = createParamDecorator((_data: unknown, ctx: ExecutionContext): JwtPayload | null => {
  const user = ctx.switchToHttp().getRequest().user as JwtPayload | undefined;
  return user?.sub ? user : null;
});
