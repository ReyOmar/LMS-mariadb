import { SetMetadata } from '@nestjs/common';
import { RolUsuario } from '../interfaces/jwt-payload.interface';

export const ROLES_KEY = 'roles';

/**
 * Restringe una ruta a los roles indicados.
 * Sin este decorador la ruta queda abierta a cualquier usuario autenticado.
 *
 * @example @Roles('ADMINISTRADOR', 'PROFESOR')
 */
export const Roles = (...roles: RolUsuario[]) => SetMetadata(ROLES_KEY, roles);
