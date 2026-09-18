import {
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
import { NOTA_MAXIMA, NOTA_MINIMA } from '../../common/domain/calificacion';

const ESTADOS = ['BORRADOR', 'PUBLICADO', 'ARCHIVADO'] as const;
const NIVELES = ['PRINCIPIANTE', 'INTERMEDIO', 'AVANZADO', 'EXPERTO'] as const;

export type EstadoCurso = (typeof ESTADOS)[number];
export type NivelCurso = (typeof NIVELES)[number];

export class CreateCursoDto {
  @IsString()
  @IsNotEmpty({ message: 'El título del curso es obligatorio.' })
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  titulo: string;

  /** Responsable del curso. Si se omite, queda a nombre de quien lo crea. */
  @IsOptional()
  @IsString()
  profesor_guid?: string;
}

export class AsignarCursoDto {
  @IsString()
  @IsNotEmpty({ message: 'Indica el profesor responsable.' })
  profesor_guid: string;
}

export class UpdateCursoDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El título no puede quedar vacío.' })
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  titulo?: string;

  @IsOptional() @IsString() @MaxLength(5000) descripcion?: string;
  @IsOptional() @IsString() @MaxLength(300) descripcion_corta?: string;
  @IsOptional() @IsString() @MaxLength(512) imagen_portada?: string;

  @IsOptional()
  @IsIn(ESTADOS, { message: `El estado debe ser uno de: ${ESTADOS.join(', ')}.` })
  estado?: EstadoCurso;

  @IsOptional()
  @IsIn(NIVELES, { message: `El nivel debe ser uno de: ${NIVELES.join(', ')}.` })
  nivel?: NivelCurso;

  @IsOptional()
  @IsInt({ message: 'La duración debe ser un número entero de horas.' })
  @Min(0)
  @Max(1000)
  duracion_horas?: number;

  /** Nota mínima para aprobar, en la escala 0–100 del sistema. */
  @IsOptional()
  @IsNumber({}, { message: 'La nota de aprobación debe ser un número.' })
  @Min(NOTA_MINIMA, { message: `La nota de aprobación no puede ser menor que ${NOTA_MINIMA}.` })
  @Max(NOTA_MAXIMA, { message: `La nota de aprobación no puede ser mayor que ${NOTA_MAXIMA}.` })
  nota_aprobacion?: number;

  @IsOptional() @IsBoolean() orden_estricto?: boolean;
  @IsOptional() @IsBoolean() emite_certificado?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'El cupo debe ser al menos 1.' })
  max_estudiantes?: number;

  @IsOptional() @IsString() @MaxLength(40) codigo_acceso?: string;

  @IsOptional() @IsDateString({}, { message: 'La fecha de inicio no es válida.' }) fecha_inicio?: string;
  @IsOptional() @IsDateString({}, { message: 'La fecha de fin no es válida.' }) fecha_fin?: string;
}

export class CreateModuloDto {
  @IsString()
  @IsNotEmpty({ message: 'El título del módulo es obligatorio.' })
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  titulo: string;

  @IsOptional() @IsInt() @Min(0) orden?: number;
}

export class UpdateModuloDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El título no puede quedar vacío.' })
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  titulo?: string;

  @IsOptional() @IsString() @MaxLength(1000) descripcion?: string;
  @IsOptional() @IsBoolean() requiere_anterior?: boolean;
}

export class ReordenarDto {
  @IsString({ each: true, message: 'La lista de identificadores no es válida.' })
  guids: string[];
}
