import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { StrictBoolean } from '../../common/validation/transforms';
import { MAX_LEGAL_TEXT_LENGTH } from '../../certificates/certificate-pdf';

export class UpdateCertificateSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(191)
  certCustomTitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  certSubtitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_LEGAL_TEXT_LENGTH, {
    message: `El texto legal no puede superar los ${MAX_LEGAL_TEXT_LENGTH} caracteres: no cabría en el certificado.`,
  })
  certLegalText?: string | null;

  @IsOptional()
  @StrictBoolean()
  @IsBoolean()
  certShowModules?: boolean;

  @IsOptional()
  @StrictBoolean()
  @IsBoolean()
  certShowResources?: boolean;

  @IsOptional()
  @StrictBoolean()
  @IsBoolean()
  certShowScore?: boolean;

  @IsOptional()
  @StrictBoolean()
  @IsBoolean()
  certShowSignature?: boolean;

  @IsOptional()
  @StrictBoolean()
  @IsBoolean()
  certShowEnrollmentDate?: boolean;

  /**
   * Meses que acredita un certificado de esta sede. `null` o 0 = sin caducidad.
   *
   * Quien necesite la capacitación de nuevo repite el curso y obtiene un certificado
   * nuevo; el anterior queda vencido, pero sigue verificándose.
   */
  @IsOptional()
  @IsInt({ message: 'La vigencia debe expresarse en meses enteros.' })
  @Min(0, { message: 'La vigencia no puede ser negativa.' })
  @Max(600, { message: 'La vigencia no puede superar los 50 años.' })
  certValidityMonths?: number | null;
}
