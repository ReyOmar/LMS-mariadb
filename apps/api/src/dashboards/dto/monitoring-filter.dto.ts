import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { MAX_PER_PAGE } from '../../common/domain/pagination';

/** Filtro del monitoreo. El alcance —sede y cursos del examinador— sale siempre del token. */
export class MonitoringFilterDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  course?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  /** Marca del último alumno recibido. Se devuelve tal cual llegó en la página anterior. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PER_PAGE)
  limit?: number;
}
