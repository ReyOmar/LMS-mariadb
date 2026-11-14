import { IsString, MaxLength } from 'class-validator';
import { Omittable } from '../../common/validation/omittable';
import { PagedSearchDto } from '../../common/validation/paged-search.dto';

/** Filtro del monitoreo. El alcance —sede y cursos del examinador— sale siempre del token. */
export class MonitoringFilterDto extends PagedSearchDto {
  @Omittable()
  @IsString()
  @MaxLength(64)
  course?: string;
}
