import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { MailService } from '../mail/mail.service';
import { StorageService } from '../storage/storage.service';
import { CourseAccessService } from '../courses/course-access.service';
import { encodeCursor, ROWS_PER_PAGE, decodeCursor } from '../common/domain/pagination';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { MIN_SEARCH_LENGTH, searchTerm } from '../common/domain/search';

/** Candidatos que se ofrecen de una vez; con más, se afina la búsqueda. */
const VISIBLE_CANDIDATES = 50;

/**
 * Matrículas de alumnos en cursos.
 *
 * La invariante que se defiende aquí es que **alumno y curso pertenecen a la misma sede**.
 * Es el único punto del sistema donde podrían cruzarse los datos de Colombia y México, ya
 * que todo lo demás (progreso, entregas, certificados) cuelga de una matrícula.
 *
 * Una baja no borra la fila, sólo la desactiva: para todo lo demás —listados, contenido,
 * paneles— quien está de baja no está matriculado.
 */
@Injectable()
export class EnrollmentsService {
  private readonly logger = new Logger(EnrollmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly realtime: RealtimeService,
    private readonly mail: MailService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Alumnos matriculados en un curso, por página. La página avanza con una marca de la
   * última matrícula entregada; ver `common/domain/pagination`.
   */
  async getEnrolledStudents(courseGuid: string, user: JwtPayload, cursor?: string) {
    await this.access.managedCourse(courseGuid, user);

    const position = decodeCursor(cursor);
    const positionId = Number(position?.id);
    const fromCursor =
      position && Number.isInteger(positionId)
        ? {
            OR: [{ enrolledAt: { lt: position.date } }, { enrolledAt: position.date, id: { lt: positionId } }],
          }
        : {};

    const enrolled = { courseGuid, active: true };
    const rows = await this.prisma.enrollment.findMany({
      where: { ...enrolled, ...fromCursor },
      select: {
        id: true,
        active: true,
        enrolledAt: true,
        user: { select: { guid: true, firstName: true, lastName: true, email: true, lastAccessAt: true } },
      },
      orderBy: [{ enrolledAt: 'desc' }, { id: 'desc' }],
      take: ROWS_PER_PAGE + 1, // uno de más para saber si queda algo por traer
    });

    const hasMore = rows.length > ROWS_PER_PAGE;
    const page = hasMore ? rows.slice(0, ROWS_PER_PAGE) : rows;
    const last = page[page.length - 1];

    return {
      // El total sólo se cuenta en la primera página: recorre el curso entero.
      ...(cursor ? {} : { total: await this.prisma.enrollment.count({ where: enrolled }) }),
      cursor: hasMore && last ? encodeCursor(last.enrolledAt, last.id) : null,
      enrolledStudents: page.map((row) => ({ ...row.user, active: row.active, enrolledAt: row.enrolledAt })),
    };
  }

  /**
   * Alumnos de la sede que no están matriculados en el curso, incluidos los que se dieron
   * de baja: es la vía para volver a matricularlos.
   *
   * `certified` avisa de que el alumno ya tiene certificado de este curso: matricularlo otra
   * vez abre una vuelta nueva y retira su avance y sus entregas anteriores (ver
   * `reactivateEnrollment`), así que la pantalla lo pide confirmar antes.
   *
   * Sin texto se listan los primeros de la sede; con una sola letra no se busca: casa con
   * casi todos y recorre la sede entera para devolver lo mismo que sin filtro.
   */
  async getCandidates(courseGuid: string, user: JwtPayload, search?: string) {
    await this.access.managedCourse(courseGuid, user);

    const typed = search?.trim() ?? '';
    if (typed.length > 0 && typed.length < MIN_SEARCH_LENGTH) return [];

    const text = searchTerm(typed);

    const candidates = await this.prisma.user.findMany({
      where: {
        country: user.country,
        role: 'STUDENT',
        enrollments: { none: { courseGuid, active: true } },
        ...(text
          ? {
              OR: [{ firstName: { contains: text } }, { lastName: { contains: text } }, { email: { contains: text } }],
            }
          : {}),
      },
      select: {
        guid: true,
        firstName: true,
        lastName: true,
        email: true,
        certificates: { where: { courseGuid }, select: { id: true }, take: 1 },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: VISIBLE_CANDIDATES,
    });

    return candidates.map(({ certificates, ...candidate }) => ({ ...candidate, certified: certificates.length > 0 }));
  }

  /**
   * Matricula a un alumno.
   * Comprueba la sede del alumno, su rol y el cupo del curso antes de crear la matrícula.
   */
  async enroll(courseGuid: string, studentGuid: string, user: JwtPayload) {
    const course = await this.access.managedCourse(courseGuid, user);

    const student = await this.prisma.user.findFirst({
      where: { guid: studentGuid, country: user.country, role: 'STUDENT' },
      select: { guid: true, email: true, firstName: true },
    });
    if (!student) {
      throw new BadRequestException('El alumno debe ser un estudiante de tu misma sede.');
    }

    const previous = await this.prisma.enrollment.findUnique({
      where: { userGuid_courseGuid: { userGuid: studentGuid, courseGuid } },
      select: { id: true, active: true },
    });
    if (previous?.active) {
      throw new ConflictException('Este alumno ya está matriculado en el curso.');
    }

    await this.checkCapacity(courseGuid);

    const enrollment = previous
      ? await this.reactivateEnrollment(previous.id, courseGuid, studentGuid)
      : await this.prisma.enrollment.create({
          data: { userGuid: studentGuid, courseGuid, type: 'MANUAL' },
        });

    this.realtime.emitToUsers(
      'enrollment:changed',
      { action: 'enrolled', courseGuid, courseTitle: course.title },
      user.country,
      [studentGuid],
    );
    this.realtime.emitToCourseStaff(
      'enrollment:changed',
      { action: 'enrolled', courseGuid },
      user.country,
      course.teacherGuid,
    );

    void this.mail
      .sendEnrollment(student.email, student.firstName, course.title, courseGuid, user.country)
      .catch((error) => this.logger.error('No se pudo avisar de la matrícula', error));

    return enrollment;
  }

  /**
   * Da de baja a un alumno conservando su historial.
   *
   * No se borra la fila: el progreso, las entregas y los certificados cuelgan de ella y
   * eliminarla destruiría el registro documental de una capacitación ya realizada.
   */
  async unenroll(courseGuid: string, studentGuid: string, user: JwtPayload) {
    const course = await this.access.managedCourse(courseGuid, user);

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userGuid_courseGuid: { userGuid: studentGuid, courseGuid } },
      select: { id: true, active: true },
    });
    if (!enrollment) throw new NotFoundException('Este alumno no está matriculado en el curso.');
    if (!enrollment.active) throw new BadRequestException('Esta matrícula ya está dada de baja.');

    await this.prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { active: false, unenrolledAt: new Date() },
    });

    this.realtime.emitToUsers('enrollment:changed', { action: 'unenrolled', courseGuid }, user.country, [studentGuid]);
    this.realtime.emitToCourseStaff(
      'enrollment:changed',
      { action: 'unenrolled', courseGuid },
      user.country,
      course.teacherGuid,
    );

    return { message: 'Matrícula dada de baja. El historial del alumno se conserva.' };
  }

  /**
   * Reactiva la matrícula de alguien que ya estuvo en el curso.
   *
   * Hay dos situaciones muy distintas y se distinguen por una sola cosa: **si llegó a
   * certificarse**.
   *
   *  - **No se certificó.** Se quedó a medias y se le dio de baja —a veces por error—.
   *    Vuelve exactamente donde lo dejó: su avance y sus entregas se conservan. Borrárselos
   *    sería castigarle por una baja administrativa.
   *  - **Ya se certificó.** Necesita la capacitación otra vez —otra infracción, años
   *    después— y tiene que **volver a hacerla**, no encontrársela aprobada. Empieza de
   *    cero: se retiran su avance y sus entregas de este curso, con lo que los
   *    cuestionarios recuperan sus intentos y la nota se calculará sólo con esta vuelta.
   *
   * En los dos casos el certificado anterior **no se toca**. Su código de verificación es
   * público y puede estar impreso en un documento ya entregado; anularlo haría desaparecer
   * una formación que sí ocurrió. Al terminar la nueva vuelta se emite otro, que lo
   * sustituye.
   *
   * Todo va en una transacción: o queda la matrícula al día con el recorrido que le
   * corresponde, o no cambia nada.
   */
  private async reactivateEnrollment(enrollmentId: number, courseGuid: string, studentGuid: string) {
    const alreadyCertified = await this.prisma.certificate.findFirst({
      where: { userGuid: studentGuid, courseGuid },
      select: { id: true },
    });

    // Empieza una vuelta nueva: deja de estar terminada aunque la anterior se certificara, y
    // quien empieza de cero no conserva avance que contar.
    const reactivation = this.prisma.enrollment.update({
      where: { id: enrollmentId },
      data: {
        active: true,
        unenrolledAt: null,
        enrolledAt: new Date(),
        completedAt: null,
        ...(alreadyCertified ? { completedResources: 0 } : {}),
      },
    });

    if (!alreadyCertified) {
      this.logger.log(`Matrícula reactivada de ${studentGuid} en ${courseGuid}: retoma donde lo dejó`);
      return reactivation;
    }

    const previousRound = { userGuid: studentGuid, assignment: { module: { courseGuid } } };
    const files = await this.prisma.submission.findMany({
      where: { ...previousRound, attachmentKey: { not: null } },
      select: { attachmentKey: true },
    });

    const [enrollment, progress, submissions] = await this.prisma.$transaction([
      reactivation,
      this.prisma.resourceProgress.deleteMany({
        where: { userGuid: studentGuid, resource: { module: { courseGuid } } },
      }),
      this.prisma.submission.deleteMany({ where: previousRound }),
    ]);

    // Los archivos se borran después de confirmar: si fallan, sólo quedan archivos sin uso
    // en el almacenamiento, no una matrícula a medias.
    void this.storage.deleteFiles(files.map((file) => file.attachmentKey));

    this.logger.log(
      `Nueva vuelta de ${studentGuid} en ${courseGuid}: ` +
        `${progress.count} avance(s) y ${submissions.count} entrega(s) de la vuelta anterior retirados`,
    );

    return enrollment;
  }

  /** Impide superar el cupo declarado del curso. */
  private async checkCapacity(courseGuid: string): Promise<void> {
    const course = await this.prisma.course.findUnique({
      where: { guid: courseGuid },
      select: { maxStudents: true },
    });
    if (!course?.maxStudents) return;

    const enrolledCount = await this.prisma.enrollment.count({ where: { courseGuid, active: true } });
    if (enrolledCount >= course.maxStudents) {
      throw new BadRequestException(
        `El curso ha alcanzado su cupo máximo de ${course.maxStudents} estudiantes. Amplíalo desde la ficha del curso para poder matricular a más.`,
      );
    }
  }
}
