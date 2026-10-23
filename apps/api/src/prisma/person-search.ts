import { Prisma } from '@prisma/client';
import { everyWord, searchWords } from '../common/domain/search';

/** Personas cuyo nombre, apellidos o correo contienen cada palabra buscada. */
export function personSearch(raw: string | undefined | null): Prisma.UserWhereInput | undefined {
  return everyWord<Prisma.UserWhereInput>(raw, (word) => [
    { firstName: { contains: word } },
    { lastName: { contains: word } },
    { email: { contains: word } },
  ]);
}

/** Lo mismo para una consulta escrita a mano sobre `usuarios` con el alias `u`. */
export function personSearchSql(raw: string | undefined | null): Prisma.Sql {
  const words = searchWords(raw).map((word) => `%${word}%`);
  if (words.length === 0) return Prisma.empty;
  return Prisma.join(
    words.map(
      (pattern) => Prisma.sql`AND (u.nombre LIKE ${pattern} OR u.apellido LIKE ${pattern} OR u.email LIKE ${pattern})`,
    ),
    ' ',
  );
}
