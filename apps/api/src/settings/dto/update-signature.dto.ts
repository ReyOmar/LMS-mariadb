import { IsOptional, IsString, MaxLength } from 'class-validator';
import { IsStorageKey } from '../../storage/storage-key.validator';

export class UpdateSignatureDto {
  /** Clave de la imagen tal como la devolvió la subida a `firmas`, o `null` para quitarla. */
  @IsOptional()
  @IsString()
  @IsStorageKey(['firmas'], { message: 'La imagen de firma no es válida. Súbela de nuevo.' })
  signatureUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  signatureName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  signatureTitle?: string | null;
}
