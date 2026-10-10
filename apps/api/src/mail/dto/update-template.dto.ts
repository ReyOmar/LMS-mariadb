import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { StrictBoolean, Trim } from '../../common/validation/transforms';

/**
 * Cambios de una plantilla. Cada campo es opcional porque activar o desactivar el envío
 * llega solo, pero el asunto y el cuerpo que se envíen no pueden quedar vacíos: el correo
 * saldría en blanco.
 */
export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El asunto no puede quedar vacío.' })
  @MaxLength(191, { message: 'El asunto no puede superar los 191 caracteres.' })
  @Trim()
  subject?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El cuerpo del correo no puede quedar vacío.' })
  @MaxLength(50_000, { message: 'El cuerpo de la plantilla no puede superar los 50 000 caracteres.' })
  @Trim()
  bodyHtml?: string;

  @IsOptional()
  @StrictBoolean()
  @IsBoolean()
  active?: boolean;
}
