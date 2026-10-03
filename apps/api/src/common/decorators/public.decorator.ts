import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/**
 * Marca una ruta como pública: no exige token.
 * Se usa en el acceso, el alta y demás rutas abiertas.
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);
