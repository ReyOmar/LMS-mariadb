import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { IsStorageKey } from '../../storage/storage-key.validator';
import { IsUploadLimitMb } from '../../storage/upload-limit.validator';

const TYPES = ['TEXT', 'VIDEO', 'PDF', 'LINK', 'ASSIGNMENT'] as const;
export type ResourceType = (typeof TYPES)[number];

/** Tope del contenido enriquecido. Evita que un pegado accidental llene la columna TEXT. */
const MAX_HTML = 100_000;

/** Material del curso: sólo puede apuntar a archivos de la carpeta de recursos. */
const resourceFile = () => IsStorageKey(['recursos'], { message: 'El archivo del recurso no es válido.' });

export class CreateResourceDto {
  @IsIn(TYPES, { message: `El tipo de bloque debe ser uno de: ${TYPES.join(', ')}.` })
  type: ResourceType;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_HTML, { message: 'El contenido no puede superar los 100 000 caracteres.' })
  contentHtml?: string;

  /** Clave del archivo principal en el almacenamiento. */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  @resourceFile()
  fileUrl?: string;
}

export class UpdateResourceDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El título no puede quedar vacío.' })
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_HTML, { message: 'El contenido no puede superar los 100 000 caracteres.' })
  contentHtml?: string;

  /** Clave del archivo principal en el almacenamiento. */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  @resourceFile()
  fileUrl?: string | null;

  @IsOptional()
  @IsUrl({ require_protocol: true }, { message: 'El enlace de referencia debe ser una URL completa (https://…).' })
  @MaxLength(2048)
  referenceUrl?: string | null;

  /** Clave del adjunto en el almacenamiento, no su contenido. */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  @resourceFile()
  attachmentKey?: string | null;

  @IsOptional() @IsString() @MaxLength(255) attachmentName?: string | null;

  /**
   * Configuración del cuestionario serializada. `CourseContentService` la valida antes de
   * guardarla: un cuestionario mal formado se rechaza aquí y no al empezar el examen.
   */
  @IsOptional() @IsString() quizConfig?: string | null;

  /** Límite de la entrega del alumno. `null` deja el general de la sede. */
  @IsOptional()
  @IsUploadLimitMb('El límite de subida')
  maxUploadMb?: number | null;

  @IsOptional() @IsInt() @Min(0) @Max(600) readingMinutes?: number | null;
}
