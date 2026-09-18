import { IsEmail, IsNotEmpty, IsString, Length, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class SolicitarCodigoDto {
  @IsEmail({}, { message: 'El correo electrónico no es válido.' })
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;
}

export class ConfirmarCodigoDto {
  @IsEmail({}, { message: 'El correo electrónico no es válido.' })
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'El código es obligatorio.' })
  @Length(6, 6, { message: 'El código tiene 6 dígitos.' })
  codigo: string;
}
