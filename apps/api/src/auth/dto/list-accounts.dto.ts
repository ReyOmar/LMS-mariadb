import { IsIn } from 'class-validator';
import { ROLES, UserRole } from '../../common/interfaces/jwt-payload.interface';
import { Omittable } from '../../common/validation/omittable';
import { PagedSearchDto } from '../../common/validation/paged-search.dto';

/** Cómo se acota el listado de cuentas de una sede. */
export class ListAccountsDto extends PagedSearchDto {
  @Omittable()
  @IsIn(ROLES, { message: `El rol debe ser uno de: ${ROLES.join(', ')}.` })
  role?: UserRole;
}
