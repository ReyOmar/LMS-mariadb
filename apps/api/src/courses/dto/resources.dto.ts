import { IsIn, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { IsStorageKey } from '../../storage/storage-key.validator';
import { IsUploadLimitMb } from '../../storage/upload-limit.validator';
import { MAX_FILE_NAME_LENGTH, shortenFileName } from '../../storage/file-name';
import { MAX_TITLE_LENGTH } from './courses.dto';

const TYPES = ['TEXT', 'VIDEO', 'PDF', 'LINK', 'ASSIGNMENT'] as const;
export type ResourceType = (typeof TYPES)[number];

/** Tope del contenido enriquecido: una lección larga cabe, un pegado accidental de megas no. */
const MAX_HTML = 100_000;

/** Lo que guarda un recurso además de su tipo y su título. El alta y la edición lo comparten. */
class ResourceContentDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_HTML, { message: 'El contenido no puede superar los 100 000 caracteres.' })
  contentHtml?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true }, { message: 'El enlace de referencia debe ser una URL completa (https://…).' })
  @MaxLength(2048)
  referenceUrl?: string | null;

  /** Clave del adjunto en el almacenamiento, no su contenido. */
  @IsOptional()
  @IsString()
  @MaxLength(191)
  @IsStorageKey(['recursos'], { message: 'El archivo del recurso no es válido.' })
  attachmentKey?: string | null;

  /** Nombre original del adjunto. Uno muy largo se recorta conservando la extensión. */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_FILE_NAME_LENGTH)
  @Transform(({ value }) => (typeof value === 'string' ? shortenFileName(value.trim()) : value))
  attachmentName?: string | null;

  /**
   * Configuración del cuestionario serializada. `CourseContentService` la valida antes de
   * guardarla: un cuestionario mal formado se rechaza aquí y no al empezar el examen.
   */
  @IsOptional() @IsString() quizConfig?: string | null;

  /** Límite de la entrega del alumno. `null` deja el general de la sede. */
  @IsOptional()
  @IsUploadLimitMb('El límite de subida')
  maxUploadMb?: number | null;
}

/** Un recurso nuevo llega completo: si algo no vale, no se crea nada. */
export class CreateResourceDto extends ResourceContentDto {
  @IsIn(TYPES, { message: `El tipo de bloque debe ser uno de: ${TYPES.join(', ')}.` })
  type: ResourceType;

  /** Sin título, el recurso se llama «Nuevo bloque». */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TITLE_LENGTH)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  title?: string;
}

export class UpdateResourceDto extends ResourceContentDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El título no puede quedar vacío.' })
  @MaxLength(MAX_TITLE_LENGTH)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  title?: string;
}
