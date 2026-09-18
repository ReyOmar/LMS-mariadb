import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtPayload, RolUsuario } from '../interfaces/jwt-payload.interface';

/**
 * Comprueba el rol exigido por `@Roles()`. Se ejecuta después de `JwtAuthGuard`, que es
 * quien deja la identidad en la petición con el rol vigente en base de datos.
 *
 * Sin `@Roles()` la ruta queda abierta a cualquier usuario autenticado; la separación por
 * país y la propiedad de los recursos las aplica cada servicio, no este guard.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const esPublica = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (esPublica) return true;

    const rolesExigidos = this.reflector.getAllAndOverride<RolUsuario[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rolesExigidos?.length) return true;

    const user = context.switchToHttp().getRequest().user as JwtPayload | undefined;
    if (!user?.role || !rolesExigidos.includes(user.role)) {
      throw new ForbiddenException('No tienes permisos para acceder a este recurso.');
    }

    return true;
  }
}
