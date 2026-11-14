import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** El nombre y el apellido que trae una edición de cuenta: lo que no llega no se toca. */
export function nameChanges(dto: { firstName?: string; lastName?: string }): Prisma.UserUpdateInput {
  const data: Prisma.UserUpdateInput = {};
  if (dto.firstName !== undefined) data.firstName = dto.firstName;
  if (dto.lastName !== undefined) data.lastName = dto.lastName;
  return data;
}

/** Una edición que no cambia nada se rechaza en lugar de guardarse en vacío. */
export function requireChanges(data: Prisma.UserUpdateInput): void {
  if (Object.keys(data).length === 0) throw new BadRequestException('No hay ningún cambio que guardar.');
}
