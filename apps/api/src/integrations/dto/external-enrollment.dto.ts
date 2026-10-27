import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { Trim } from '../../common/validation/transforms';
import { AccountEmail } from '../../common/validation/account-email';
import { CourseCode } from '../../common/validation/course-code';

/** Lo que admite un identificador externo: viaja en la ruta de la consulta, así que nada que haya que escapar. */
export const EXTERNAL_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
export const MAX_EXTERNAL_ID_LENGTH = 100;

/**
 * Lo que manda otro sistema para que una persona haga un curso: quién es y qué código de curso.
 * La sede no viaja: es la de la clave con la que llama.
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

  @CourseCode()
  courseCode: string;

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

  @AccountEmail()
  email: string;
}
