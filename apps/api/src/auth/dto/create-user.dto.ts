import { IsEmail, IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { NormalizeEmail, Trim } from '../../common/validation/transforms';
import { ROLES, UserRole } from '../../common/interfaces/jwt-payload.interface';

/**
 * Alta directa de una cuenta por un administrador.
 * El país no viaja en el cuerpo: se toma de la sesión del administrador, que sólo puede
 * crear cuentas en su propia sede. La contraseña tampoco: la genera el servidor y la
 * recibe la persona por correo.
 */
export class CreateUserDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio.' })
  @MaxLength(100)
  @Trim()
  firstName: string;

  @IsString()
  @IsNotEmpty({ message: 'El apellido es obligatorio.' })
  @MaxLength(100)
  @Trim()
  lastName: string;

  @IsEmail({}, { message: 'El correo electrónico no es válido.' })
  @MaxLength(255)
  @NormalizeEmail()
  email: string;

  @IsIn(ROLES, { message: 'El rol no es válido.' })
  role: UserRole;
}
