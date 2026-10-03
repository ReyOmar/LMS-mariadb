import { Equals, IsEmail, IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { NormalizeEmail, Trim } from '../../common/validation/transforms';
import { IsCountry } from '../../common/validation/country.validator';
import { Country } from '../../common/domain/country';
import { UserRole } from '../../common/interfaces/jwt-payload.interface';

/** Roles que un visitante puede pedir por sí mismo. Un ADMIN sólo lo crea otro administrador. */
const REQUESTABLE_ROLES: UserRole[] = ['STUDENT', 'TEACHER'];

export class RequestAccessDto {
  @IsEmail({}, { message: 'El correo electrónico no es válido.' })
  @IsNotEmpty({ message: 'El correo es obligatorio.' })
  @MaxLength(255)
  @NormalizeEmail()
  email: string;

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

  @IsIn(REQUESTABLE_ROLES, { message: 'Sólo puedes solicitar acceso como estudiante o profesor.' })
  requestedRole: UserRole;

  /** Sede a la que pertenecerá la cuenta. No se puede cambiar después. */
  @IsCountry()
  country: Country;

  /** Autorización expresa del tratamiento de datos, obligatoria para solicitar acceso. */
  @Equals(true, { message: 'Debes aceptar la política de tratamiento de datos para enviar la solicitud.' })
  acceptsDataPolicy: boolean;
}
