import { Prisma } from '@prisma/client';

/** Si la base rechazó la escritura porque ya existe una fila con ese valor único. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
