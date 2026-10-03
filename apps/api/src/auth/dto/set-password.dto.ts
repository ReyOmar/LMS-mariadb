import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { MAX_PASSWORD_LENGTH } from '../../common/domain/password';
import { NormalizeEmail } from '../../common/validation/transforms';

export class SetPasswordDto {
  @IsEmail({}, { message: 'El correo electrónico no es válido.' })
  @IsNotEmpty({ message: 'El correo electrónico es obligatorio.' })
  @MaxLength(255)
  @NormalizeEmail()
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'La contraseña temporal es obligatoria para verificar tu identidad.' })
  @MaxLength(MAX_PASSWORD_LENGTH)
  temporaryPassword: string;

  // La robustez la valida el servicio con la regla única de `common/domain/password`.
  @IsString()
  @IsNotEmpty({ message: 'La nueva contraseña es obligatoria.' })
  @MaxLength(MAX_PASSWORD_LENGTH)
  newPassword: string;
}
