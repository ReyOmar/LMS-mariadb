import {
  IsEmail,
  IsHexColor,
  IsInt,
  IsOptional,
  IsString,
  IsTimeZone,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { IsStorageKey } from '../../storage/storage-key.validator';
import { IsUploadLimitMb } from '../../storage/upload-limit.validator';
import { EmptyToNull } from '../../common/validation/transforms';

/** Tope de cada texto legal: cabe una política extensa, no un pegado accidental de megas. */
export const MAX_LEGAL_DOCUMENT_LENGTH = 100_000;

/**
 * Configuración editable de una sede.
 *
 * El país **no** está aquí a propósito: se toma de la sesión del administrador, de modo
 * que no exista forma de editar la configuración de la otra sede desde el cliente.
 *
 * Todos los campos son opcionales para permitir guardados parciales, pero el
 * `ValidationPipe` global rechaza cualquier propiedad que no aparezca en esta lista: un
 * campo mal escrito da error en vez de guardarse a medias sin avisar.
 */
export class UpdateSettingsDto {
  // ── Identidad visual ──
  @IsOptional() @IsString() @MaxLength(120) platformName?: string;

  // Claves de almacenamiento tal como las devuelve la subida, o `null` para quitarlas.
  @IsOptional() @IsString() @IsStorageKey(['logos']) @MaxLength(191) logoUrl?: string | null;
  @IsOptional() @IsString() @IsStorageKey(['logos']) @MaxLength(191) faviconUrl?: string | null;
  @IsOptional() @IsString() @IsStorageKey(['fondos']) @MaxLength(191) loginBackgroundUrl?: string | null;

  @IsOptional()
  @IsHexColor({ message: 'El color primario debe ser hexadecimal (#RRGGBB).' })
  primaryColor?: string;

  @IsOptional()
  @IsHexColor({ message: 'El color secundario debe ser hexadecimal (#RRGGBB).' })
  secondaryColor?: string;

  @IsOptional() @IsString() @MaxLength(60) font?: string;

  @IsOptional()
  @IsInt()
  @Min(0, { message: 'El redondeo de bordes no puede ser negativo.' })
  @Max(40, { message: 'El redondeo de bordes no puede superar 40 px.' })
  borderRadius?: number;

  // ── Operativa ──
  @IsOptional() @IsString() @MaxLength(500) welcomeMessage?: string;
  @IsOptional() @IsTimeZone({ message: 'La zona horaria no es válida.' }) timeZone?: string;

  /**
   * Límite general de subida de la sede: el de las tareas sin límite propio y el del
   * material de curso. Admite omitirse, pero no borrarse: siempre tiene que haber uno.
   */
  @ValidateIf((_dto, value) => value !== undefined)
  @IsUploadLimitMb('El tamaño máximo de archivo')
  maxFileMb?: number;

  // ── Portada ──
  @IsOptional() @IsString() @MaxLength(120) landingHeroTitle1?: string;
  @IsOptional() @IsString() @MaxLength(120) landingHeroTitle2?: string;
  @IsOptional() @IsString() @MaxLength(1000) landingHeroSubtitle?: string;

  @IsOptional() @IsString() @MaxLength(60) landingPhone?: string;
  @IsOptional() @IsString() @MaxLength(120) landingPhoneSub?: string;
  @IsOptional() @IsString() @MaxLength(191) landingEmail?: string;
  @IsOptional() @IsString() @MaxLength(120) landingEmailSub?: string;
  @IsOptional() @IsString() @MaxLength(191) landingOffice?: string;
  @IsOptional() @IsString() @MaxLength(191) landingOfficeSub?: string;
  @IsOptional() @IsString() @MaxLength(1000) landingFooterText?: string;

  // ── Legal: responsable del tratamiento y textos ──
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(191) legalEntityName?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(60) legalEntityTaxId?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(191) legalAddress?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsEmail({}, { message: 'El correo de privacidad no es válido.' })
  @MaxLength(191)
  privacyEmail?: string | null;
  @IsOptional() @IsString() @MaxLength(MAX_LEGAL_DOCUMENT_LENGTH) legalTerms?: string | null;
  @IsOptional() @IsString() @MaxLength(MAX_LEGAL_DOCUMENT_LENGTH) legalPrivacy?: string | null;
  @IsOptional() @IsString() @MaxLength(MAX_LEGAL_DOCUMENT_LENGTH) legalData?: string | null;
}
