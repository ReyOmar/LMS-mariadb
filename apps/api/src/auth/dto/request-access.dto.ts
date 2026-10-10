import { Equals, IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { StrictBoolean, Trim } from '../../common/validation/transforms';
import { IsCountry } from '../../common/validation/country.validator';
import { Country } from '../../common/domain/country';
import { UserRole } from '../../common/interfaces/jwt-payload.interface';
import { AccountEmail } from '../../common/validation/account-email';

/** Roles que un visitante puede pedir por sí mismo. Un ADMIN sólo lo crea otro administrador. */
const REQUESTABLE_ROLES: UserRole[] = ['STUDENT', 'TEACHER'];

export class RequestAccessDto {
  @IsNotEmpty({ message: 'El correo es obligatorio.' })
  @AccountEmail()
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
  @StrictBoolean()
  @Equals(true, { message: 'Debes aceptar la política de tratamiento de datos para enviar la solicitud.' })
  acceptsDataPolicy: boolean;
}
