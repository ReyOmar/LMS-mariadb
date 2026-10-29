import { IsIn } from 'class-validator';
import { ROLES, UserRole } from '../../common/interfaces/jwt-payload.interface';
import { AccountEmail } from '../../common/validation/account-email';
import { PersonName } from '../../common/validation/person-name';

/**
 * Alta directa de una cuenta por un administrador.
 * El país no viaja en el cuerpo: se toma de la sesión del administrador, que sólo puede
 * crear cuentas en su propia sede. La contraseña tampoco: la genera el servidor y la
 * recibe la persona por correo.
 */
export class CreateUserDto {
  @PersonName()
  firstName: string;

  @PersonName()
  lastName: string;

  @AccountEmail()
  email: string;

  @IsIn(ROLES, { message: 'El rol no es válido.' })
  role: UserRole;
}
