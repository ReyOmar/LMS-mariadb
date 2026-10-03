import { IsEmail, IsNotEmpty, IsString, Length, MaxLength } from 'class-validator';
import { NormalizeEmail } from '../../common/validation/transforms';
import { IsCountry } from '../../common/validation/country.validator';
import type { Country } from '../../common/domain/country';

export class RequestCodeDto {
  @IsEmail({}, { message: 'El correo electrónico no es válido.' })
  @MaxLength(255)
  @NormalizeEmail()
  email: string;

  /** Sede desde la que se solicita el acceso: el correo sale con su marca. */
  @IsCountry()
  country: Country;
}

export class ConfirmCodeDto {
  @IsEmail({}, { message: 'El correo electrónico no es válido.' })
  @MaxLength(255)
  @NormalizeEmail()
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'El código es obligatorio.' })
  @Length(6, 6, { message: 'El código tiene 6 dígitos.' })
  code: string;
}
