import { Type } from 'class-transformer';
import { IsIn, IsInt, IsString, Max, MaxLength, Min } from 'class-validator';
import { MAX_PER_PAGE } from '../../common/domain/pagination';
import { ROLES, UserRole } from '../../common/interfaces/jwt-payload.interface';
import { Omittable } from '../../common/validation/omittable';

/** Cómo se acota el listado de cuentas de una sede. */
export class ListAccountsDto {
  @Omittable()
  @IsIn(ROLES, { message: `El rol debe ser uno de: ${ROLES.join(', ')}.` })
  role?: UserRole;

  @Omittable()
  @IsString()
  @MaxLength(100)
  search?: string;

  /** Marca de la última cuenta recibida. Se devuelve tal cual llegó en la página anterior. */
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
