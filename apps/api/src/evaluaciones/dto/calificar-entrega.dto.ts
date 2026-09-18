import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { NOTA_MAXIMA, NOTA_MINIMA } from '../../common/domain/calificacion';

export class CalificarEntregaDto {
  /**
   * Nota en la escala del sistema (0–100).
   * El límite superior sale de `common/domain/calificacion`, no de un número escrito a
   * mano: antes el DTO fijaba `@Max(5)` e ignoraba la escala real del curso.
   */
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'La calificación debe ser un número.' })
  @Min(NOTA_MINIMA, { message: `La calificación mínima es ${NOTA_MINIMA}.` })
  @Max(NOTA_MAXIMA, { message: `La calificación máxima es ${NOTA_MAXIMA}.` })
  calificacion: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'El comentario no puede superar los 2000 caracteres.' })
  comentario?: string;
}
