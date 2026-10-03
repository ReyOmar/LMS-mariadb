import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { MAX_SCORE, MIN_SCORE } from '../../common/domain/grading';

export class GradeSubmissionDto {
  /** Nota en la escala del sistema (0–100), definida en `common/domain/grading`. */
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'La calificación debe ser un número.' })
  @Min(MIN_SCORE, { message: `La calificación mínima es ${MIN_SCORE}.` })
  @Max(MAX_SCORE, { message: `La calificación máxima es ${MAX_SCORE}.` })
  score: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'El comentario no puede superar los 2000 caracteres.' })
  feedback?: string;
}
