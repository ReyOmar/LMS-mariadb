import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { MAX_PASSWORD_LENGTH } from '../../common/domain/password';
import { AccountEmail } from '../../common/validation/account-email';

export class SetPasswordDto {
  @IsNotEmpty({ message: 'El correo electrónico es obligatorio.' })
  @AccountEmail()
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
