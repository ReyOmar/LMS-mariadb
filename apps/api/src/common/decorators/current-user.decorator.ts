import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Inyecta la identidad autenticada de la petición.
 *
 * Falla si no hay sesión en lugar de devolver `undefined`: un controlador protegido que
 * reciba `undefined` acabaría consultando con un `guid` vacío y devolviendo datos que no
 * corresponden. Una ruta `@Public()` que quiera leer al usuario cuando lo haya debe sacarlo
 * de la petición por su cuenta, para que quede claro que puede no estar.
 *
 * @example getMyProfile(@CurrentUser() user: JwtPayload)
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): JwtPayload => {
  const user = ctx.switchToHttp().getRequest().user as JwtPayload | undefined;
  if (!user?.sub) {
    throw new UnauthorizedException('Sesión no válida. Vuelve a iniciar sesión.');
  }
  return user;
});
