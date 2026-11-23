import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CourseStatus, Role } from '@prisma/client';
import { SettingsService } from '../settings/settings.service';
import { normalizeScore } from '../common/domain/grading';
import { Country } from '../common/domain/country';
import { timeZoneOffset, dayInTimeZone, currentMonthStart } from '../common/domain/time-zone';

/** Días que abarca la gráfica de actividad reciente. */
const ACTIVITY_DAYS = 7;

/** Cursos que se muestran en el reparto de matrículas. */
const COURSES_IN_DISTRIBUTION = 10;

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** Sucesos que se muestran en «Actividad reciente». */
const RECENT_EVENTS = 8;

/**
 * Algo que pasó en la sede durante la semana, para «Actividad reciente». No hay un registro de
 * actividad aparte: cada suceso sale de la fila que ya deja (el certificado, la matrícula, la
 * entrega, la cuenta), con su propia fecha.
 */
export interface RecentEvent {
  type: 'certificate' | 'enrollment' | 'submission' | 'account';
  at: Date;
  /** Quién: el titular del certificado, el alumno o la persona de la cuenta nueva. */
  person: string;
  /** Sobre qué: el curso o la tarea. En una cuenta nueva, su rol. */
  subject: string;
}

/** La semana de las gráficas: sus días, en la hora de la sede, y el instante en que empieza. */
interface ActivityWindow {
  timeZone: string;
  offset: string;
  days: string[];
  from: Date;
}

/** Panel de administración de la sede. Los recuentos son agregados de la base. */
@Injectable()
export class DashboardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** Resumen de la sede: personas, cursos, promedio y actividad reciente. */
  async getCountrySummary(country: Country) {
    const window = await this.activityWindow(country);
    const [accountsByRole, pendingRequests, coursesByStatus, totalEnrollments, average, activity, breakdown] =
      await Promise.all([
        // Todas las cuentas de la sede, de cualquier rol.
        this.prisma.user.groupBy({ by: ['role'], where: { country }, _count: { _all: true } }),
        this.prisma.accessRequest.count({ where: { country, status: 'PENDING' } }),
        // De cualquier estado: también los archivados que vienen de la versión de julio.
        this.prisma.course.groupBy({ by: ['status'], where: { country }, _count: { _all: true } }),
        this.prisma.enrollment.count({ where: { active: true, course: { country } } }),
        this.overallAverage(country),
        this.recentActivity(country, window),
        this.enrollmentBreakdown(country),
      ]);
    // Las novedades van después, en una segunda tanda: así no se piden a la vez todas las
    // conexiones del grupo para una sola pantalla.
    const [newUsers, newEnrollments, recentEvents] = await Promise.all([
      this.prisma.user.count({ where: { country, createdAt: { gte: currentMonthStart(window.timeZone) } } }),
      // Las de la semana de las gráficas, y sólo las vigentes, como el total de al lado.
      this.prisma.enrollment.count({ where: { active: true, enrolledAt: { gte: window.from }, course: { country } } }),
      this.recentEvents(country, window.from),
    ]);

    const accounts = (role: 'STUDENT' | 'TEACHER' | 'ADMIN') =>
      accountsByRole.find((row) => row.role === role)?._count._all ?? 0;
    const students = accounts('STUDENT');
    const teachers = accounts('TEACHER');
    const admins = accounts('ADMIN');
    const courses = (status: CourseStatus) => coursesByStatus.find((row) => row.status === status)?._count._all ?? 0;

    return {
      users: {
        total: students + teachers + admins,
        students,
        teachers,
        admins,
        /** Cuentas creadas desde el día 1 del mes de la sede. */
        newThisMonth: newUsers,
      },
      courses: {
        published: courses('PUBLISHED'),
        draft: courses('DRAFT'),
        total: coursesByStatus.reduce((total, row) => total + row._count._all, 0),
      },
      pendingRequests,
      totalEnrollments,
      /** Matrículas vigentes abiertas en la semana de las gráficas. */
      newEnrollments,
      overallAverage: average,
      weeklyActivity: activity,
      courseBreakdown: breakdown,
      recentEvents,
    };
  }

  /**
   * Nota media de la sede: la mejor de cada alumno en cada evaluación, como en sus métricas y
   * en el certificado. Contar cada intento hundiría el promedio de quien tuvo que repetir.
   */
  private async overallAverage(country: Country): Promise<number | null> {
    const [row] = await this.prisma.$queryRaw<{ average: unknown }[]>`
      SELECT AVG(best) AS average FROM (
        SELECT MAX(e.calificacion) AS best
        FROM lms_entregas e
        JOIN usuarios u ON u.guid = e.usuario_guid
        WHERE e.estado = 'CALIFICADA' AND e.calificacion IS NOT NULL AND e.tarea_guid IS NOT NULL
          AND u.pais = ${country}
        GROUP BY e.usuario_guid, e.tarea_guid
      ) evaluations`;
    return row?.average == null ? null : normalizeScore(Number(row.average));
  }

  /** Los últimos `ACTIVITY_DAYS` días, hoy incluido, en la hora de la sede. */
  private async activityWindow(country: Country): Promise<ActivityWindow> {
    const { timeZone } = await this.settings.getSettings(country);
    const offset = timeZoneOffset(timeZone);
    const now = Date.now();
    const days = Array.from({ length: ACTIVITY_DAYS }, (_, i) =>
      dayInTimeZone(new Date(now - (ACTIVITY_DAYS - 1 - i) * 86_400_000), timeZone),
    );
    return { timeZone, offset, days, from: new Date(`${days[0]}T00:00:00${offset}`) };
  }

  /** Entregas, recursos completados y cuentas nuevas por día durante la semana, en la hora de la sede. */
  private async recentActivity(country: Country, { offset, days, from }: ActivityWindow) {
    const [submissions, resources, accounts] = await Promise.all([
      this.prisma.$queryRaw<{ dayKey: string; total: bigint }[]>`
        SELECT DATE_FORMAT(CONVERT_TZ(e.fecha_entrega, '+00:00', ${offset}), '%Y-%m-%d') AS dayKey, COUNT(*) AS total
        FROM lms_entregas e
        JOIN usuarios u ON u.guid = e.usuario_guid
        WHERE e.fecha_entrega >= ${from} AND u.pais = ${country}
        GROUP BY dayKey`,
      this.prisma.$queryRaw<{ dayKey: string; total: bigint }[]>`
        SELECT DATE_FORMAT(CONVERT_TZ(p.fecha_completado, '+00:00', ${offset}), '%Y-%m-%d') AS dayKey, COUNT(*) AS total
        FROM lms_progreso_recurso p
        JOIN usuarios u ON u.guid = p.usuario_guid
        WHERE p.fecha_completado >= ${from} AND u.pais = ${country}
        GROUP BY dayKey`,
      this.prisma.$queryRaw<{ dayKey: string; total: bigint }[]>`
        SELECT DATE_FORMAT(CONVERT_TZ(u.created_at, '+00:00', ${offset}), '%Y-%m-%d') AS dayKey, COUNT(*) AS total
        FROM usuarios u
        WHERE u.created_at >= ${from} AND u.pais = ${country}
        GROUP BY dayKey`,
    ]);

    const byDay = (rows: { dayKey: string; total: bigint }[]) =>
      new Map(rows.map((row) => [row.dayKey, Number(row.total)]));
    const submissionsByDay = byDay(submissions);
    const resourcesByDay = byDay(resources);
    const accountsByDay = byDay(accounts);

    // Los días sin actividad no vienen en el resultado y el gráfico los necesita en cero.
    return days.map((day) => ({
      day: DAY_NAMES[new Date(`${day}T12:00:00Z`).getUTCDay()],
      submissions: submissionsByDay.get(day) ?? 0,
      resources: resourcesByDay.get(day) ?? 0,
      users: accountsByDay.get(day) ?? 0,
    }));
  }

  /**
   * Lo último que pasó en la sede desde `from`: certificados emitidos, matrículas, tareas
   * entregadas y cuentas nuevas, de lo más reciente a lo más antiguo. Cada fuente trae como mucho
   * `RECENT_EVENTS` filas por su índice de fecha, y se mezclan aquí.
   */
  private async recentEvents(country: Country, from: Date): Promise<RecentEvent[]> {
    const since = { gte: from };
    const take = RECENT_EVENTS;
    const person = { select: { firstName: true, lastName: true } };

    const [certificates, enrollments, submissions, accounts] = await Promise.all([
      // El certificado guarda la sede, el titular y el curso: no hace falta cruzar tablas.
      this.prisma.certificate.findMany({
        where: { country, createdAt: since },
        orderBy: { createdAt: 'desc' },
        take,
        select: { createdAt: true, holderName: true, courseTitle: true },
      }),
      this.prisma.enrollment.findMany({
        where: { active: true, enrolledAt: since, course: { country } },
        orderBy: { enrolledAt: 'desc' },
        take,
        select: { enrolledAt: true, user: person, course: { select: { title: true } } },
      }),
      // Sólo tareas: los cuestionarios se corrigen solos y sus intentos llenarían la lista.
      this.prisma.submission.findMany({
        where: { status: { not: 'DRAFT' }, submittedAt: since, user: { country }, assignment: { quizConfig: null } },
        orderBy: { submittedAt: 'desc' },
        take,
        select: { submittedAt: true, user: person, assignment: { select: { title: true } } },
      }),
      this.prisma.user.findMany({
        where: { country, createdAt: since },
        orderBy: { createdAt: 'desc' },
        take,
        select: { createdAt: true, firstName: true, lastName: true, role: true },
      }),
    ]);

    const nameOf = (who: { firstName: string; lastName: string }) => `${who.firstName} ${who.lastName}`.trim();
    const events: RecentEvent[] = [
      ...certificates.map((row) => ({
        type: 'certificate' as const,
        at: row.createdAt,
        person: row.holderName,
        subject: row.courseTitle,
      })),
      ...enrollments.map((row) => ({
        type: 'enrollment' as const,
        at: row.enrolledAt,
        person: nameOf(row.user),
        subject: row.course.title,
      })),
      ...submissions.flatMap((row) =>
        row.submittedAt && row.assignment
          ? [
              {
                type: 'submission' as const,
                at: row.submittedAt,
                person: nameOf(row.user),
                subject: row.assignment.title,
              },
            ]
          : [],
      ),
      ...accounts.map((row) => ({
        type: 'account' as const,
        at: row.createdAt,
        person: nameOf(row),
        subject: row.role satisfies Role,
      })),
    ];
    return events.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, RECENT_EVENTS);
  }

  /** Cursos publicados de la sede con más matrículas activas. */
  private async enrollmentBreakdown(country: Country) {
    const courses = await this.prisma.$queryRaw<{ guid: string; name: string; enrollments: bigint }[]>`
      SELECT c.guid, c.titulo AS name, COUNT(m.id) AS enrollments
      FROM lms_cursos c
      LEFT JOIN lms_matriculas m ON m.curso_guid = c.guid AND m.activa = 1
      WHERE c.pais = ${country} AND c.estado = 'PUBLICADO'
      GROUP BY c.guid, c.titulo
      ORDER BY enrollments DESC, c.titulo ASC
      LIMIT ${COURSES_IN_DISTRIBUTION}`;

    return courses.map((course) => ({
      guid: course.guid,
      name: course.name,
      enrollments: Number(course.enrollments),
    }));
  }
}
