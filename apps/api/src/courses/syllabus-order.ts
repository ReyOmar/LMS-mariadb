import { Prisma } from '@prisma/client';

/**
 * Orden del temario: por posición y, a igualdad, por antigüedad. El desempate hace el orden
 * estable aunque dos filas compartan posición, como las creadas antes de numerar al final.
 */
export const SYLLABUS_ORDER: [{ position: Prisma.SortOrder }, { createdAt: Prisma.SortOrder }] = [
  { position: 'asc' },
  { createdAt: 'asc' },
];

/** Posición para añadir al final. Contar las filas la repetiría en cuanto se hubiera borrado alguna. */
export function nextPosition(last: { _max: { position: number | null } }): number {
  return (last._max.position ?? -1) + 1;
}
