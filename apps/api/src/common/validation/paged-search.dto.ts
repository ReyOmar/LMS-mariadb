import { Type } from 'class-transformer';
import { IsInt, IsString, Max, MaxLength, Min } from 'class-validator';
import { MAX_PER_PAGE } from '../domain/pagination';
import { Omittable } from './omittable';

/** Lo común a los listados por páginas: qué se busca, desde dónde se sigue y cuántas filas se piden. */
export class PagedSearchDto {
  @Omittable()
  @IsString()
  @MaxLength(100)
  search?: string;

  /** Marca de la última fila recibida. Se devuelve tal cual llegó en la página anterior. */
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
