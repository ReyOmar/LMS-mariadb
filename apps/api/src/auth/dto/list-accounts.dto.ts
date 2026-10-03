import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { MAX_PER_PAGE } from '../../common/domain/pagination';
import { ROLES, UserRole } from '../../common/interfaces/jwt-payload.interface';

/** Cómo se acota el listado de cuentas de una sede. */
export class ListAccountsDto {
  @IsOptional()
  @IsIn(ROLES, { message: `El rol debe ser uno de: ${ROLES.join(', ')}.` })
  role?: UserRole;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  /** Marca de la última cuenta recibida. Se devuelve tal cual llegó en la página anterior. */
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
