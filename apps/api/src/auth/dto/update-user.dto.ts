import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../common/validation/transforms';
import { ROLES, UserRole } from '../../common/interfaces/jwt-payload.interface';

/**
 * Lo que un administrador puede cambiar de una cuenta de su sede.
 *
 * El correo no está por el mismo motivo que en el perfil propio: identifica la cuenta en la
 * recuperación de contraseña. La sede tampoco: una cuenta pertenece a una sola.
 */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El nombre no puede quedar vacío.' })
  @MaxLength(100)
  @Trim()
  firstName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El apellido no puede quedar vacío.' })
  @MaxLength(100)
  @Trim()
  lastName?: string;

  @IsOptional()
  @IsIn(ROLES, { message: 'El rol no es válido.' })
  role?: UserRole;
}
