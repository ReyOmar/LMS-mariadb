import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { MAX_PASSWORD_LENGTH } from '../../common/domain/password';
import { Trim } from '../../common/validation/transforms';

/**
 * Datos editables del propio perfil.
 *
 * El correo no está: identifica la cuenta en recuperación de contraseña y en los avisos,
 * y cambiarlo sin re-verificar abriría una vía para apropiarse de una cuenta ajena.
 */
export class UpdateProfileDto {
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
  @IsString()
  @MaxLength(MAX_PASSWORD_LENGTH)
  currentPassword?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_PASSWORD_LENGTH)
  newPassword?: string;
}
