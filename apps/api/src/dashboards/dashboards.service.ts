import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { normalizeScore } from '../common/domain/grading';
import { Country } from '../common/domain/country';
import { timeZoneOffset, dayInTimeZone } from '../common/domain/time-zone';

/** Días que abarca la gráfica de actividad reciente. */
const ACTIVITY_DAYS = 7;

/** Cursos que se muestran en el reparto de matrículas. */
const COURSES_IN_DISTRIBUTION = 10;

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** Panel de administración de la sede. Los recuentos son agregados de la base. */
@Injectable()
export class DashboardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** Resumen de la sede: personas, cursos, promedio y actividad reciente. */
  async getCountrySummary(country: Country) {
    const [
      accountsByRole,
      pendingRequests,
      publishedCourses,
      draftCourses,
      totalEnrollments,
      scores,
      activity,
      breakdown,
    ] = await Promise.all([
      // Todas las cuentas de la sede, de cualquier rol.
      this.prisma.user.groupBy({ by: ['role'], where: { country }, _count: { _all: true } }),
      this.prisma.accessRequest.count({ where: { country, status: 'PENDING' } }),
      this.prisma.course.count({ where: { country, status: 'PUBLISHED' } }),
      this.prisma.course.count({ where: { country, status: 'DRAFT' } }),
      this.prisma.enrollment.count({ where: { active: true, course: { country } } }),
      this.prisma.submission.aggregate({
        where: { status: 'GRADED', score: { not: null }, user: { country } },
        _avg: { score: true },
      }),
      this.recentActivity(country),
      this.enrollmentBreakdown(country),
    ]);

    const accounts = (role: 'STUDENT' | 'TEACHER' | 'ADMIN') =>
      accountsByRole.find((row) => row.role === role)?._count._all ?? 0;
    const students = accounts('STUDENT');
    const teachers = accounts('TEACHER');
    const admins = accounts('ADMIN');
    const average = scores._avg.score;

    return {
      users: {
        total: students + teachers + admins,
        students,
        teachers,
        admins,
      },
      courses: {
        published: publishedCourses,
        draft: draftCourses,
        total: publishedCourses + draftCourses,
      },
      pendingRequests,
      totalEnrollments,
      overallAverage: average === null ? null : normalizeScore(Number(average)),
      weeklyActivity: activity,
      courseBreakdown: breakdown,
    };
  }

  /** Entregas y recursos completados por día durante la última semana, en la hora de la sede. */
  private async recentActivity(country: Country) {
    const { timeZone } = await this.settings.getSettings(country);
    const offset = timeZoneOffset(timeZone);

    const now = Date.now();
    const days = Array.from({ length: ACTIVITY_DAYS }, (_, i) =>
      dayInTimeZone(new Date(now - (ACTIVITY_DAYS - 1 - i) * 86_400_000), timeZone),
    );
    const from = new Date(`${days[0]}T00:00:00${offset}`);

    const [submissions, resources] = await Promise.all([
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
    ]);

    const submissionsByDay = new Map(submissions.map((row) => [row.dayKey, Number(row.total)]));
    const resourcesByDay = new Map(resources.map((row) => [row.dayKey, Number(row.total)]));

    // Los días sin actividad no vienen en el resultado y el gráfico los necesita en cero.
    return days.map((day) => ({
      day: DAY_NAMES[new Date(`${day}T12:00:00Z`).getUTCDay()],
      submissions: submissionsByDay.get(day) ?? 0,
      resources: resourcesByDay.get(day) ?? 0,
    }));
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
