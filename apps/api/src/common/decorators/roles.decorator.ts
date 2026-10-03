import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../interfaces/jwt-payload.interface';

export const REQUIRED_ROLES = 'roles';

/**
 * Restringe una ruta a los roles indicados.
 * Sin este decorador la ruta queda abierta a cualquier usuario autenticado.
 *
 * @example @Roles('ADMIN', 'TEACHER')
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(REQUIRED_ROLES, roles);
