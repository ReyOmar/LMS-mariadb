import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { MAX_PASSWORD_LENGTH } from '../../common/domain/password';
import { IsCountry } from '../../common/validation/country.validator';
import { Country } from '../../common/domain/country';
import { AccountEmail } from '../../common/validation/account-email';

export class LoginDto {
  @IsNotEmpty({ message: 'El correo es obligatorio.' })
  @AccountEmail()
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'La contraseña es obligatoria.' })
  @MaxLength(MAX_PASSWORD_LENGTH)
  password: string;

  /**
   * Sede desde la que se intenta entrar. Debe coincidir con la de la cuenta: es la
   * comprobación que impide que un usuario de una sede acceda a los datos de la otra.
   */
  @IsCountry()
  country: Country;
}
