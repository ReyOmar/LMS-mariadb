import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload, UserRole } from '../common/interfaces/jwt-payload.interface';

/** Lo que hace falta de alguien para decidir si se le puede escribir. */
interface Person {
  guid: string;
  role: UserRole;
}

/**
 * Con quién puede hablar cada usuario en la mensajería, que nunca sale de su sede.
 *
 * Se comprueba en el servidor: conocer el identificador de una persona no basta para
 * escribirle, y menos aún a alguien de la otra sede.
 *  - Con un administrador la conversación está abierta en los dos sentidos: atiende a
 *    toda su sede y puede escribir a cualquiera sin solicitud.
 *  - El examinador de un curso y sus alumnos activos se escriben sin solicitud.
 *  - Entre los demás hace falta una solicitud aceptada **y** seguir compartiendo un curso
 *    activo: quien se da de baja deja de recibir mensajes, aunque conserva el historial.
 */
@Injectable()
export class ChatAccess {
  constructor(private readonly prisma: PrismaService) {}

  /** La otra persona, siempre de la sede del usuario: la de otra sede no existe para él. */
  async person(user: JwtPayload, guid: string): Promise<Person> {
    const person = await this.prisma.user.findFirst({
      where: { guid, country: user.country },
      select: { guid: true, role: true },
    });
    if (!person) throw new NotFoundException('Usuario no encontrado.');
    return person;
  }

  /** De las personas indicadas —todas de la sede del usuario—, a cuáles puede escribir. */
  async writableAmong(user: JwtPayload, people: Person[]): Promise<Set<string>> {
    if (user.role === 'ADMIN') return new Set(people.map((person) => person.guid));

    const writable = new Set(people.filter((person) => person.role === 'ADMIN').map((person) => person.guid));
    const others = people.filter((person) => person.role !== 'ADMIN').map((person) => person.guid);
    if (others.length === 0) return writable;

    const [courses, accepted] = await Promise.all([
      // Cursos del usuario en los que participa alguno de los demás.
      this.prisma.course.findMany({
        where: {
          country: user.country,
          AND: [
            { OR: [{ teacherGuid: user.sub }, { enrollments: { some: { userGuid: user.sub, active: true } } }] },
            {
              OR: [
                { teacherGuid: { in: others } },
                { enrollments: { some: { userGuid: { in: others }, active: true } } },
              ],
            },
          ],
        },
        select: {
          teacherGuid: true,
          enrollments: { where: { userGuid: { in: others }, active: true }, select: { userGuid: true } },
        },
      }),
      this.prisma.chatContact.findMany({
        where: {
          status: 'ACCEPTED',
          OR: [
            { requesterGuid: user.sub, receiverGuid: { in: others } },
            { requesterGuid: { in: others }, receiverGuid: user.sub },
          ],
        },
        select: { requesterGuid: true, receiverGuid: true },
      }),
    ]);

    const acceptedGuids = new Set(
      accepted.map((relation) =>
        relation.requesterGuid === user.sub ? relation.receiverGuid : relation.requesterGuid,
      ),
    );

    for (const course of courses) {
      const teaches = course.teacherGuid === user.sub;
      // Si el examinador es otro, el usuario es alumno de este curso: es su examinador.
      if (!teaches && others.includes(course.teacherGuid)) writable.add(course.teacherGuid);
      for (const { userGuid } of course.enrollments) {
        if (teaches || acceptedGuids.has(userGuid)) writable.add(userGuid);
      }
    }

    return writable;
  }

  /** Nombre con el que se presenta a alguien en los avisos de la mensajería. */
  async nameOf(userGuid: string): Promise<string> {
    const person = await this.prisma.user.findUnique({
      where: { guid: userGuid },
      select: { firstName: true, lastName: true },
    });
    return person ? `${person.firstName} ${person.lastName}` : 'Un usuario';
  }
}
