import { IsNotEmpty, IsString, Length } from 'class-validator';
import { IsCountry } from '../../common/validation/country.validator';
import type { Country } from '../../common/domain/country';
import { AccountEmail } from '../../common/validation/account-email';

export class RequestCodeDto {
  @AccountEmail()
  email: string;

  /** Sede desde la que se solicita el acceso: el correo sale con su marca. */
  @IsCountry()
  country: Country;
}

export class ConfirmCodeDto {
  @AccountEmail()
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'El código es obligatorio.' })
  @Length(6, 6, { message: 'El código tiene 6 dígitos.' })
  code: string;
}
