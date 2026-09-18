import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { EsPais } from '../../common/dto/pais.validator';
import { Pais } from '../../common/domain/pais';

export class LoginDto {
  @IsEmail({}, { message: 'El correo electrónico no es válido.' })
  @IsNotEmpty({ message: 'El correo es obligatorio.' })
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'La contraseña es obligatoria.' })
  @MaxLength(128)
  contrasena: string;

  /**
   * Sede desde la que se intenta entrar. Debe coincidir con la de la cuenta: es la
   * comprobación que impide que un usuario de una sede acceda a los datos de la otra.
   */
  @EsPais()
  pais: Pais;
}
