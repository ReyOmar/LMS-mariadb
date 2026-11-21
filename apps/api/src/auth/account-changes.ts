import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { definedFields } from '../common/domain/defined-fields';

/** El nombre y el apellido que trae una edición de cuenta: lo que no llega no se toca. */
export function nameChanges(dto: { firstName?: string; lastName?: string }): Prisma.UserUpdateInput {
  return definedFields(dto, ['firstName', 'lastName']);
}

/** Una edición que no cambia nada se rechaza en lugar de guardarse en vacío. */
export function requireChanges(data: Prisma.UserUpdateInput): void {
  if (Object.keys(data).length === 0) throw new BadRequestException('No hay ningún cambio que guardar.');
}
