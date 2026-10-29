import { IsIn } from 'class-validator';
import { ROLES, UserRole } from '../../common/interfaces/jwt-payload.interface';
import { Omittable } from '../../common/validation/omittable';
import { PersonName } from '../../common/validation/person-name';

/**
 * Lo que un administrador puede cambiar de una cuenta de su sede.
 *
 * El correo no está por el mismo motivo que en el perfil propio: identifica la cuenta en la
 * recuperación de contraseña. La sede tampoco: una cuenta pertenece a una sola.
 */
export class UpdateUserDto {
  @Omittable()
  @PersonName()
  firstName?: string;

  @Omittable()
  @PersonName()
  lastName?: string;

  @Omittable()
  @IsIn(ROLES, { message: 'El rol no es válido.' })
  role?: UserRole;
}
