import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class MarcarRecursoDto {
  @IsString()
  @IsNotEmpty({ message: 'Falta el identificador del recurso.' })
  recurso_guid: string;
}

export class LatidoDto {
  @IsString()
  @IsNotEmpty({ message: 'Falta el identificador del curso.' })
  curso_guid: string;
}

export class DiasActivosDto {
  @Type(() => Number)
  @IsInt({ message: 'El año no es válido.' })
  @Min(2000)
  @Max(2100)
  year: number;

  /** Índice de mes 0–11, igual que `Date.getMonth()` en el cliente. */
  @Type(() => Number)
  @IsInt({ message: 'El mes no es válido.' })
  @Min(0)
  @Max(11)
  month: number;
}
