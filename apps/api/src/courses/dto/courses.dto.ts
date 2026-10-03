import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { StrictBoolean } from '../../common/validation/transforms';
import { MAX_SCORE, MIN_SCORE } from '../../common/domain/grading';
import { IsStorageKey } from '../../storage/storage-key.validator';

const STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
const LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'] as const;

export type CourseStatus = (typeof STATUSES)[number];
export type CourseLevel = (typeof LEVELS)[number];

export class CreateCourseDto {
  @IsString()
  @IsNotEmpty({ message: 'El título del curso es obligatorio.' })
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  title: string;

  /** Responsable del curso. Si se omite, queda a nombre de quien lo crea. */
  @IsOptional()
  @IsString()
  teacherGuid?: string;
}

export class AssignCourseDto {
  @IsString()
  @IsNotEmpty({ message: 'Indica el profesor responsable.' })
  teacherGuid: string;
}

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El título no puede quedar vacío.' })
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  title?: string;

  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsString() @MaxLength(300) shortDescription?: string;

  /** Clave de la portada en el almacenamiento; `null` la quita. */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  @IsStorageKey(['portadas'], { message: 'La portada no es un archivo válido.' })
  coverImage?: string | null;

  @IsOptional()
  @IsIn(STATUSES, { message: `El estado debe ser uno de: ${STATUSES.join(', ')}.` })
  status?: CourseStatus;

  @IsOptional()
  @IsIn(LEVELS, { message: `El nivel debe ser uno de: ${LEVELS.join(', ')}.` })
  level?: CourseLevel;

  /**
   * Horas que acredita el certificado. `null` las deja sin declarar.
   * No es el tiempo que tarde cada alumno: eso se registra aparte.
   */
  @IsOptional()
  @IsInt({ message: 'La duración debe ser un número entero de horas.' })
  @Min(1, { message: 'La duración debe ser de al menos una hora.' })
  @Max(1000)
  durationHours?: number | null;

  /** Nota mínima para aprobar, en la escala 0–100 del sistema. */
  @IsOptional()
  @IsNumber({}, { message: 'La nota de aprobación debe ser un número.' })
  @Min(MIN_SCORE, { message: `La nota de aprobación no puede ser menor que ${MIN_SCORE}.` })
  @Max(MAX_SCORE, { message: `La nota de aprobación no puede ser mayor que ${MAX_SCORE}.` })
  passingScore?: number;

  @IsOptional() @StrictBoolean() @IsBoolean() strictOrder?: boolean;

  /** Alumnos matriculados a la vez como mucho; `null` lo deja sin límite. */
  @IsOptional()
  @IsInt({ message: 'El cupo debe ser un número entero de estudiantes.' })
  @Min(1, { message: 'El cupo debe ser al menos 1.' })
  maxStudents?: number | null;

  @IsOptional() @IsString() @MaxLength(40) accessCode?: string | null;

  @IsOptional() @IsDateString({}, { message: 'La fecha de inicio no es válida.' }) startDate?: string | null;
  @IsOptional() @IsDateString({}, { message: 'La fecha de fin no es válida.' }) endDate?: string | null;
}

export class CreateModuleDto {
  @IsString()
  @IsNotEmpty({ message: 'El título del módulo es obligatorio.' })
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  title: string;

  @IsOptional() @IsInt() @Min(0) position?: number;
}

export class UpdateModuleDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El título no puede quedar vacío.' })
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  title?: string;

  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @StrictBoolean() @IsBoolean() requiresPrevious?: boolean;
}

export class ReorderDto {
  @IsArray({ message: 'La lista de identificadores no es válida.' })
  @ArrayMaxSize(500)
  @IsString({ each: true, message: 'La lista de identificadores no es válida.' })
  guids: string[];
}
