import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class MarkResourceDto {
  @IsString()
  @IsNotEmpty({ message: 'Falta el identificador del recurso.' })
  resourceGuid: string;
}

export class HeartbeatDto {
  @IsString()
  @IsNotEmpty({ message: 'Falta el identificador del curso.' })
  courseGuid: string;
}

export class ActiveDaysDto {
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
