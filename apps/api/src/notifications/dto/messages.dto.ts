import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

const REF_TYPES = ['quiz_retry', 'entrega_revision', 'general'] as const;

export class SendMessageDto {
  @IsString()
  @IsNotEmpty({ message: 'Indica el destinatario.' })
  recipientGuid: string;

  @IsString()
  @IsNotEmpty({ message: 'El asunto es obligatorio.' })
  @MaxLength(150, { message: 'El asunto no puede superar los 150 caracteres.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  subject: string;

  @IsString()
  @IsNotEmpty({ message: 'El mensaje no puede estar vacío.' })
  @MaxLength(5000, { message: 'El mensaje no puede superar los 5000 caracteres.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  content: string;

  @IsOptional()
  @IsIn(REF_TYPES, { message: 'El tipo de referencia no es válido.' })
  refType?: (typeof REF_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  refGuid?: string;
}

export class RequestContactDto {
  @IsString()
  @IsNotEmpty({ message: 'Indica la persona con la que quieres contactar.' })
  receiverGuid: string;

  /** Curso por el que se conocen. Si no viene, el servidor busca uno que compartan. */
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Indica el curso que comparten.' })
  courseGuid?: string;
}

export class ContactSearchDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class NotificationsQueryDto {
  /** Cuántos avisos devolver; el servicio lo acota a su máximo. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El límite debe ser un número entero.' })
  @Min(1)
  limit?: number;
}

export class RespondToContactDto {
  @IsBoolean({ message: 'Indica si aceptas o rechazas la solicitud.' })
  accept: boolean;
}
