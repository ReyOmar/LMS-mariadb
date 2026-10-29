import { Equals, IsIn, IsNotEmpty } from 'class-validator';
import { StrictBoolean } from '../../common/validation/transforms';
import { IsCountry } from '../../common/validation/country.validator';
import { Country } from '../../common/domain/country';
import { UserRole } from '../../common/interfaces/jwt-payload.interface';
import { AccountEmail } from '../../common/validation/account-email';
import { PersonName } from '../../common/validation/person-name';

/** Roles que un visitante puede pedir por sí mismo. Un ADMIN sólo lo crea otro administrador. */
const REQUESTABLE_ROLES: UserRole[] = ['STUDENT', 'TEACHER'];

export class RequestAccessDto {
  @IsNotEmpty({ message: 'El correo es obligatorio.' })
  @AccountEmail()
  email: string;

  @PersonName()
  firstName: string;

  @PersonName()
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
