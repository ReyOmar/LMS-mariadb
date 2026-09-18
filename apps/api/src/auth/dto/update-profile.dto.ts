import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

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
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  nombre?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El apellido no puede quedar vacío.' })
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  apellido?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  contrasena_actual?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  nueva_contrasena?: string;
}
