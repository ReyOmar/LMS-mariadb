import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

const REFERENCIAS = ['quiz_retry', 'entrega_revision', 'general'] as const;

export class EnviarMensajeDto {
  @IsString()
  @IsNotEmpty({ message: 'Indica el destinatario.' })
  destinatario_guid: string;

  @IsString()
  @IsNotEmpty({ message: 'El asunto es obligatorio.' })
  @MaxLength(150, { message: 'El asunto no puede superar los 150 caracteres.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  asunto: string;

  @IsString()
  @IsNotEmpty({ message: 'El mensaje no puede estar vacío.' })
  @MaxLength(5000, { message: 'El mensaje no puede superar los 5000 caracteres.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  contenido: string;

  @IsOptional()
  @IsIn(REFERENCIAS, { message: 'El tipo de referencia no es válido.' })
  ref_tipo?: (typeof REFERENCIAS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ref_guid?: string;
}

export class SolicitarContactoDto {
  @IsString()
  @IsNotEmpty({ message: 'Indica la persona con la que quieres contactar.' })
  receptor_guid: string;

  @IsString()
  @IsNotEmpty({ message: 'Indica el curso que compartís.' })
  curso_guid: string;
}

export class ResponderContactoDto {
  @IsBoolean({ message: 'Indica si aceptas o rechazas la solicitud.' })
  aceptar: boolean;
}
