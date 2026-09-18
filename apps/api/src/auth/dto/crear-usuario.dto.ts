import { IsEmail, IsIn, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { RolUsuario } from '../../common/interfaces/jwt-payload.interface';

const ROLES: RolUsuario[] = ['ADMINISTRADOR', 'PROFESOR', 'ESTUDIANTE'];

/**
 * Alta directa de una cuenta por un administrador.
 * El país no viaja en el cuerpo: se toma de la sesión del administrador, que sólo puede
 * crear cuentas en su propia sede.
 */
export class CrearUsuarioDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio.' })
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  nombre: string;

  @IsString()
  @IsNotEmpty({ message: 'El apellido es obligatorio.' })
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  apellido: string;

  @IsEmail({}, { message: 'El correo electrónico no es válido.' })
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;

  @IsIn(ROLES, { message: 'El rol no es válido.' })
  rol: RolUsuario;

  @IsString()
  @MinLength(8, { message: 'La contraseña temporal debe tener al menos 8 caracteres.' })
  @MaxLength(128)
  contrasena_temporal: string;
}
