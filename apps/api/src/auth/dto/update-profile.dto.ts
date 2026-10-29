import { IsString, MaxLength } from 'class-validator';
import { MAX_PASSWORD_LENGTH } from '../../common/domain/password';
import { Omittable } from '../../common/validation/omittable';
import { PersonName } from '../../common/validation/person-name';

/**
 * Datos editables del propio perfil.
 *
 * El correo no está: identifica la cuenta en recuperación de contraseña y en los avisos,
 * y cambiarlo sin re-verificar abriría una vía para apropiarse de una cuenta ajena.
 */
export class UpdateProfileDto {
  @Omittable()
  @PersonName()
  firstName?: string;

  @Omittable()
  @PersonName()
  lastName?: string;

  @Omittable()
  @IsString()
  @MaxLength(MAX_PASSWORD_LENGTH)
  currentPassword?: string;

  @Omittable()
  @IsString()
  @MaxLength(MAX_PASSWORD_LENGTH)
  newPassword?: string;
}
