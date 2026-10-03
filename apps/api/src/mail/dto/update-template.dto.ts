import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { StrictBoolean } from '../../common/validation/transforms';

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'El asunto no puede superar los 200 caracteres.' })
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50_000, { message: 'El cuerpo de la plantilla no puede superar los 50 000 caracteres.' })
  bodyHtml?: string;

  @IsOptional()
  @StrictBoolean()
  @IsBoolean()
  active?: boolean;
}
