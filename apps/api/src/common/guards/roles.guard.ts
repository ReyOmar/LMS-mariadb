import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_ROLES } from '../decorators/roles.decorator';
import { IS_PUBLIC } from '../decorators/public.decorator';
import { JwtPayload, UserRole } from '../interfaces/jwt-payload.interface';

/**
 * Comprueba el rol exigido por `@Roles()`. Se ejecuta después de `JwtGuard`, que es
 * quien deja la identidad en la petición con el rol vigente en base de datos.
 *
 * Sin `@Roles()` la ruta queda abierta a cualquier usuario autenticado; la separación por
 * país y la propiedad de los recursos las aplica cada servicio, no este guard.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(REQUIRED_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles?.length) return true;

    const user = context.switchToHttp().getRequest().user as JwtPayload | undefined;
    if (!user?.role || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('No tienes permisos para acceder a este recurso.');
    }

    return true;
  }
}
