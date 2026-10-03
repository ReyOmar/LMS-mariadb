import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { MAX_PASSWORD_LENGTH } from '../../common/domain/password';
import { NormalizeEmail } from '../../common/validation/transforms';

export class RequestPasswordResetDto {
  @IsEmail({}, { message: 'El correo electrónico no es válido.' })
  @MaxLength(255)
  @NormalizeEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'El enlace de recuperación no es válido.' })
  @MaxLength(128)
  token: string;

  @IsString()
  @IsNotEmpty({ message: 'La nueva contraseña es obligatoria.' })
  @MaxLength(MAX_PASSWORD_LENGTH)
  newPassword: string;
}
