import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

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
  certLegalText?: string | null;

  @IsOptional()
  @IsBoolean()
  certShowModules?: boolean;

  @IsOptional()
  @IsBoolean()
  certShowResources?: boolean;

  @IsOptional()
  @IsBoolean()
  certShowScore?: boolean;

  @IsOptional()
  @IsBoolean()
  certShowSignature?: boolean;

  @IsOptional()
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
