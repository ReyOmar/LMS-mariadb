import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class SetupPasswordDto {
  @IsEmail({}, { message: 'El correo electrónico no es válido.' })
  @IsNotEmpty({ message: 'El correo electrónico es obligatorio.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'La contraseña temporal es obligatoria para verificar tu identidad.' })
  @MaxLength(128)
  contrasenaTemporal: string;

  // La robustez exacta la valida el servicio con un único conjunto de reglas
  // (longitud, letra y número), para que el mensaje de error sea el mismo aquí,
  // al restablecer la contraseña y al cambiarla desde el perfil.
  @IsString()
  @IsNotEmpty({ message: 'La nueva contraseña es obligatoria.' })
  @MaxLength(128)
  nuevaContrasena: string;
}
