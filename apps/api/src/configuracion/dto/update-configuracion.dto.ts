import { IsEmail, IsHexColor, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

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
export class UpdateConfiguracionDto {
  // ── Identidad visual ──
  @IsOptional() @IsString() @MaxLength(120) nombre_plataforma?: string;
  @IsOptional() @IsString() @MaxLength(512) logo_url?: string | null;
  @IsOptional() @IsString() @MaxLength(512) favicon_url?: string | null;
  @IsOptional() @IsString() @MaxLength(512) login_fondo_url?: string | null;

  @IsOptional() @IsHexColor({ message: 'El color primario debe ser hexadecimal (#RRGGBB).' })
  color_primario?: string;

  @IsOptional() @IsHexColor({ message: 'El color secundario debe ser hexadecimal (#RRGGBB).' })
  color_secundario?: string;

  @IsOptional() @IsString() @MaxLength(60) fuente?: string;

  @IsOptional()
  @IsInt()
  @Min(0, { message: 'El redondeo de bordes no puede ser negativo.' })
  @Max(40, { message: 'El redondeo de bordes no puede superar 40 px.' })
  border_radius?: number;

  // ── Operativa ──
  @IsOptional() @IsString() @MaxLength(500) mensaje_bienvenida?: string;
  @IsOptional() @IsString() @MaxLength(10) idioma?: string;
  @IsOptional() @IsString() @MaxLength(60) zona_horaria?: string;

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'El tamaño máximo de archivo debe ser al menos 1 MB.' })
  @Max(50, { message: 'El tamaño máximo de archivo no puede superar 50 MB.' })
  max_archivo_mb?: number;

  /** Clave temporal de las cuentas nuevas de la sede. */
  @IsOptional() @IsString() @MaxLength(128) contrasena_defecto?: string;

  @IsOptional() @IsEmail({}, { message: 'El correo remitente no es válido.' }) email_remitente?: string | null;
  @IsOptional() @IsString() @MaxLength(120) email_nombre?: string | null;
  @IsOptional() @IsString() bienvenida_html?: string | null;

  // ── Portada ──
  @IsOptional() @IsString() @MaxLength(120) landing_hero_titulo1?: string;
  @IsOptional() @IsString() @MaxLength(120) landing_hero_titulo2?: string;
  @IsOptional() @IsString() @MaxLength(1000) landing_hero_subtitulo?: string;

  @IsOptional() @IsString() @MaxLength(60) landing_telefono?: string;
  @IsOptional() @IsString() @MaxLength(120) landing_telefono_sub?: string;
  @IsOptional() @IsString() @MaxLength(255) landing_email?: string;
  @IsOptional() @IsString() @MaxLength(120) landing_email_sub?: string;
  @IsOptional() @IsString() @MaxLength(255) landing_oficina?: string;
  @IsOptional() @IsString() @MaxLength(255) landing_oficina_sub?: string;
  @IsOptional() @IsString() @MaxLength(1000) landing_footer_texto?: string;

  // ── Legal ──
  @IsOptional() @IsString() legal_terminos?: string | null;
  @IsOptional() @IsString() legal_privacidad?: string | null;
  @IsOptional() @IsString() legal_datos?: string | null;
}
