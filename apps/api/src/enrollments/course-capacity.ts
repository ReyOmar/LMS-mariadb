import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plural } from '../common/domain/text';

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

/** El curso no tiene plaza. Una matrícula que pide otro sistema no falla por esto: espera a que la haya. */
export class CourseFullException extends BadRequestException {
  constructor(maxStudents: number) {
    super(
      `El curso ha alcanzado su cupo máximo de ${maxStudents} ${plural(maxStudents, 'estudiante', 'estudiantes')}. Amplíalo desde la ficha del curso para poder matricular a más.`,
    );
  }
}

/** Impide superar el cupo declarado del curso; `maxStudents` es el que devolvió `lockCourseCapacity`. */
export async function ensureSeat(tx: Prisma.TransactionClient, courseGuid: string, maxStudents: number | null) {
  if (maxStudents && (await occupiedSeats(tx, courseGuid)) >= maxStudents) throw new CourseFullException(maxStudents);
}
