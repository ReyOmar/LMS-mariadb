import { Type } from 'class-transformer';
import { IsInt, IsString, Max, MaxLength, Min } from 'class-validator';
import { MAX_PER_PAGE } from '../../common/domain/pagination';
import { Omittable } from '../../common/validation/omittable';

/** Filtro del monitoreo. El alcance —sede y cursos del examinador— sale siempre del token. */
export class MonitoringFilterDto {
  @Omittable()
  @IsString()
  @MaxLength(64)
  course?: string;

  @Omittable()
  @IsString()
  @MaxLength(100)
  search?: string;

  /** Marca del último alumno recibido. Se devuelve tal cual llegó en la página anterior. */
  @Omittable()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @Omittable()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PER_PAGE)
  limit?: number;
}
