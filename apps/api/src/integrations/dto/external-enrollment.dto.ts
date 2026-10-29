import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { COUNTRIES, Country, normalizeCountry } from '../../common/domain/country';
import { Trim } from '../../common/validation/transforms';
import { AccountEmail } from '../../common/validation/account-email';
import { InfractionCode } from '../../common/validation/infraction-code';
import { PersonName } from '../../common/validation/person-name';

/** Lo que admite un identificador externo: viaja en la ruta de la consulta, así que nada que haya que escapar. */
const EXTERNAL_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
const MAX_EXTERNAL_ID_LENGTH = 100;

/**
 * Lo que manda otro sistema para que una persona haga un curso: quién es, de qué sede y por qué
 * infracción. El curso lo decide el campus a partir de la infracción.
 */
export class ExternalEnrollmentDto {
  /**
   * Identificador de la solicitud en el sistema que la envía, como el número de la infracción.
   * Con él se consulta después, y repetir el envío con el mismo no crea otra.
   */
  @IsString()
  @IsNotEmpty({ message: 'Falta el identificador externo de la solicitud.' })
  @MaxLength(MAX_EXTERNAL_ID_LENGTH)
  @Matches(EXTERNAL_ID_PATTERN, {
    message: 'El identificador externo sólo admite letras sin tilde, cifras, puntos, guiones y dos puntos.',
  })
  @Trim()
  externalId: string;

  /** El tipo de infracción tal como lo nombra el otro sistema, como `C29`. */
  @InfractionCode()
  infractionCode: string;

  /** Qué es la infracción, para el administrador que elige su curso. Opcional. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') || null : value,
  )
  infractionDescription?: string | null;

  /** La sede de la persona: `CO` o `MX`, o su nombre. Tiene que ser la de la clave con la que se llama. */
  @Transform(({ value }: { value: unknown }) => normalizeCountry(value) ?? value)
  @IsIn(COUNTRIES, { message: 'La sede (country) tiene que ser CO (Colombia) o MX (México).' })
  country: Country;

  @PersonName()
  firstName: string;

  @PersonName()
  lastName: string;

  @AccountEmail()
  email: string;
}
