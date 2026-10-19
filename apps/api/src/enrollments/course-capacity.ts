import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Bloquea la fila del curso hasta el final de la transacción y devuelve su cupo: cuántos
 * alumnos puede tener matriculados a la vez (`null`, sin límite).
 *
 * Matricular y cambiar el cupo la bloquean los dos, así que lo que cada uno cuente después ya
 * incluye lo que confirmó el otro. Tiene que ser lo primero que toca la transacción.
 */
export async function lockCourseCapacity(tx: Prisma.TransactionClient, courseGuid: string): Promise<number | null> {
  const [course] = await tx.$queryRaw<{ maxStudents: number | null }[]>`
    SELECT max_estudiantes AS maxStudents FROM lms_cursos WHERE guid = ${courseGuid} FOR UPDATE`;
  if (!course) throw new NotFoundException('Curso no encontrado.');
  return course.maxStudents === null ? null : Number(course.maxStudents);
}

/**
 * Plazas ocupadas del curso: las matrículas en curso. Quien ya se certificó conserva el acceso
 * para repasar, pero no ocupa plaza: si no, el curso se llenaría para siempre.
 */
export function occupiedSeats(tx: Prisma.TransactionClient, courseGuid: string): Promise<number> {
  return tx.enrollment.count({ where: { courseGuid, active: true, completedAt: null } });
}
