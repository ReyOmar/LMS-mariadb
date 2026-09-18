import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RechazarSolicitudDto {
  /** Motivo opcional, se conserva para que quede constancia de por qué se rechazó. */
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'El motivo no puede exceder 500 caracteres.' })
  motivo?: string;
}
