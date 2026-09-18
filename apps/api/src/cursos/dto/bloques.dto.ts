import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';

const TIPOS = ['TEXTO', 'VIDEO', 'PDF', 'ENLACE', 'TAREA'] as const;
export type TipoRecurso = (typeof TIPOS)[number];

/** Tope del contenido enriquecido. Evita que un pegado accidental llene la columna TEXT. */
const MAX_HTML = 100_000;

export class CreateBloqueDto {
  @IsIn(TIPOS, { message: `El tipo de bloque debe ser uno de: ${TIPOS.join(', ')}.` })
  tipo: TipoRecurso;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  titulo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_HTML, { message: 'El contenido no puede superar los 100 000 caracteres.' })
  contenido_html?: string;
}

export class UpdateBloqueDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El título no puede quedar vacío.' })
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  titulo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_HTML, { message: 'El contenido no puede superar los 100 000 caracteres.' })
  contenido_html?: string;

  /** Clave del archivo principal en el almacenamiento. */
  @IsOptional() @IsString() @MaxLength(512) url_archivo?: string | null;

  @IsOptional()
  @IsUrl({ require_protocol: true }, { message: 'El enlace de referencia debe ser una URL completa (https://…).' })
  @MaxLength(2048)
  url_referencia?: string | null;

  /** Clave del adjunto en el almacenamiento, no su contenido. */
  @IsOptional() @IsString() @MaxLength(512) archivo_adjunto?: string | null;
  @IsOptional() @IsString() @MaxLength(255) archivo_adjunto_nombre?: string | null;

  /**
   * Configuración del cuestionario serializada. `BloqueService` la valida antes de
   * guardarla: un cuestionario mal formado se rechaza aquí y no al empezar el examen.
   */
  @IsOptional() @IsString() quiz_config?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'El límite de subida debe ser al menos 1 MB.' })
  @Max(50, { message: 'El límite de subida no puede superar 50 MB.' })
  archivo_max_size_mb?: number | null;

  @IsOptional() @IsInt() @Min(0) @Max(600) tiempo_lectura?: number | null;
}
