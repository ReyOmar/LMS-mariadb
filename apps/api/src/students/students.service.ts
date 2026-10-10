import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CourseAccessService } from '../courses/course-access.service';
import { recordCompletion } from '../courses/resource-progress';
import { AWAITING_GRADE, waitedTooLong } from '../courses/progression';
import { averageOfScores } from '../common/domain/grading';
import { percent } from '../common/domain/progress';
import { dayInTimeZone, timeZoneOffset } from '../common/domain/time-zone';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { emitEvent } from '../common/domain/domain-events';

/**
 * Hueco a partir del cual se considera que empezó una sesión nueva, y tope de lo que
 * puede sumar un solo latido.
 *
 * Va atado al latido del cliente (`useStudyTime`, un aviso por minuto): son dos latidos y
 * medio. El margen evita que una red lenta parta una sesión en pedazos —lo que congelaría
 * el contador— y a la vez impide que un hueco largo se cuente como estudio. Si allí cambia
 * el intervalo, este número tiene que acompañarlo.
 */
const SESSION_CUTOFF_SECONDS = 150;

/** Primer instante del mes indicado (0–11; 12 es enero del año siguiente) en la zona de la sede. */
function monthStart(year: number, month: number, timeZone: string): Date {
  const firstDay = new Date(Date.UTC(year, month, 1));
  const date = firstDay.toISOString().slice(0, 10);
  return new Date(`${date}T00:00:00${timeZoneOffset(timeZone, firstDay)}`);
}

/**
 * Progreso, métricas y tiempo de estudio del alumno.
 * Todos los métodos trabajan sobre el usuario en sesión: nadie puede leer ni marcar el
 * progreso de otro.
 */
@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly settings: SettingsService,
    private readonly events: EventEmitter2,
  ) {}

  // ── Progreso ─────────────────────────────────────────────────────────────

  /**
   * Estado de avance del alumno en un curso: qué tiene completado, qué se le desbloqueó
   * por espera y qué tareas siguen pendientes de calificación.
   */
  async getProgress(courseGuid: string, user: JwtPayload) {
    const course = await this.access.courseInCountry(courseGuid, user.country);
    await this.access.ensureEnrollment(courseGuid, user.sub);

    const resources = await this.access.getCourseResources(courseGuid);
    if (resources.length === 0) {
      return {
        completed: [],
        unlockedByWait: [],
        pendingAssignments: [],
        totalResources: 0,
        percent: 0,
        courseTitle: course.title,
      };
    }

    const guids = resources.map((resource) => resource.guid);
    const [progress, pendingSubmissions] = await Promise.all([
      this.prisma.resourceProgress.findMany({
        where: { userGuid: user.sub, resourceGuid: { in: guids } },
        select: { resourceGuid: true },
      }),
      this.prisma.submission.findMany({
        where: {
          userGuid: user.sub,
          assignmentGuid: { in: guids },
          status: { in: AWAITING_GRADE },
        },
        select: { assignmentGuid: true, submittedAt: true },
      }),
    ]);

    const completed = progress.map((row) => row.resourceGuid);
    const alreadyCompleted = new Set(completed);
    const titles = new Map(resources.map((resource) => [resource.guid, resource.title]));

    const unlocked: string[] = [];
    const pending: { resourceGuid: string; title: string; submittedAt: string | null }[] = [];

    for (const submission of pendingSubmissions) {
      if (!submission.assignmentGuid) continue;

      pending.push({
        resourceGuid: submission.assignmentGuid,
        title: titles.get(submission.assignmentGuid) ?? 'Tarea',
        submittedAt: submission.submittedAt?.toISOString() ?? null,
      });

      if (waitedTooLong(submission.submittedAt) && !alreadyCompleted.has(submission.assignmentGuid)) {
        unlocked.push(submission.assignmentGuid);
      }
    }

    return {
      completed,
      unlockedByWait: unlocked,
      pendingAssignments: pending,
      totalResources: resources.length,
      percent: percent(completed.length, resources.length),
      courseTitle: course.title,
    };
  }

  /**
   * Marca un recurso como completado.
   *
   * Sólo aplica a recursos de estudio: las tareas y los cuestionarios se completan al
   * aprobarlos, no porque el navegador diga que se leyeron. Con orden estricto, el recurso
   * tiene que estar desbloqueado.
   */
  async markResourceCompleted(resourceGuid: string, user: JwtPayload) {
    const course = await this.access.unlockedResourceAccess(resourceGuid, user);

    const resource = await this.prisma.resource.findUnique({
      where: { guid: resourceGuid },
      select: { type: true, quizConfig: true },
    });
    if (!resource) {
      return { completed: false, reason: 'El recurso ya no existe.' };
    }
    if (resource.type === 'ASSIGNMENT') {
      return {
        completed: false,
        reason: resource.quizConfig
          ? 'Este cuestionario se completa al aprobarlo.'
          : 'Esta tarea se completa cuando el examinador la califica.',
      };
    }

    await recordCompletion(this.prisma, user.sub, resourceGuid, course.guid);

    // Completar un recurso puede ser lo último que faltaba para el certificado.
    emitEvent(this.events, 'progress.updated', {
      userGuid: user.sub,
      country: user.country,
      courseGuid: course.guid,
    });

    return { completed: true };
  }

  // ── Métricas ─────────────────────────────────────────────────────────────

  /**
   * Resumen del alumno sobre los cursos en los que sigue matriculado: cursos, avance,
   * horas de estudio y promedio sobre 100.
   *
   * Un curso cuenta como completado cuando su vuelta actual está certificada
   * (`completedAt`), no sólo por tener todos los recursos: con alguna tarea aún sin
   * calificar sigue siendo formación en curso.
   */
  async getMetrics(user: JwtPayload) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userGuid: user.sub, active: true },
      select: { courseGuid: true, completedAt: true },
    });
    const courseGuids = enrollments.map((enrollment) => enrollment.courseGuid);

    if (courseGuids.length === 0) {
      return {
        totalCourses: 0,
        completedCourses: 0,
        completedResources: 0,
        totalResources: 0,
        percent: 0,
        totalHoursSpent: 0,
        overallAverage: null,
      };
    }

    const inTheirCourses = { module: { courseGuid: { in: courseGuids } } };
    const [resources, progress, studyTime, bestScores] = await Promise.all([
      this.prisma.resource.findMany({
        where: inTheirCourses,
        select: { guid: true },
      }),
      this.prisma.resourceProgress.findMany({
        where: { userGuid: user.sub, resource: inTheirCourses },
        select: { resourceGuid: true },
      }),
      this.prisma.studySession.aggregate({
        where: { userGuid: user.sub, courseGuid: { in: courseGuids } },
        _sum: { durationSeconds: true },
      }),
      // La mejor nota de cada evaluación, como en el certificado: los intentos suspendidos
      // antes de aprobar no hunden el promedio de quien repitió.
      this.prisma.submission.groupBy({
        by: ['assignmentGuid'],
        where: { userGuid: user.sub, status: 'GRADED', score: { not: null }, assignment: inTheirCourses },
        _max: { score: true },
      }),
    ]);

    const completed = new Set(progress.map((row) => row.resourceGuid));
    const completedResources = resources.filter((resource) => completed.has(resource.guid)).length;

    return {
      totalCourses: courseGuids.length,
      completedCourses: enrollments.filter((enrollment) => enrollment.completedAt !== null).length,
      completedResources,
      totalResources: resources.length,
      percent: percent(completedResources, resources.length),
      totalHoursSpent: Math.round(((studyTime._sum.durationSeconds ?? 0) / 3600) * 10) / 10,
      overallAverage: averageOfScores(bestScores.map((assessment) => assessment._max.score)),
    };
  }

  /**
   * Días del mes con actividad registrada, para el calendario del panel del alumno.
   * El mes y los días son los de la sede, no los del servidor: una entrega a las 22:00 en
   * Bogotá es de ese día aunque en UTC ya sea el siguiente.
   */
  async getActiveDays(user: JwtPayload, year: number, month: number) {
    const { timeZone } = await this.settings.getSettings(user.country);
    const start = monthStart(year, month, timeZone);
    const end = monthStart(year, month + 1, timeZone);

    const [progress, submissions] = await Promise.all([
      this.prisma.resourceProgress.findMany({
        where: { userGuid: user.sub, completedAt: { gte: start, lt: end } },
        select: { completedAt: true },
      }),
      this.prisma.submission.findMany({
        where: { userGuid: user.sub, submittedAt: { gte: start, lt: end } },
        select: { submittedAt: true },
      }),
    ]);

    const instants = [
      ...progress.map((row) => row.completedAt),
      ...submissions.flatMap((row) => (row.submittedAt ? [row.submittedAt] : [])),
    ];
    const days = new Set(instants.map((instant) => Number(dayInTimeZone(instant, timeZone).slice(8, 10))));

    return { days: [...days].sort((a, b) => a - b) };
  }

  // ── Tiempo de estudio ────────────────────────────────────────────────────

  /**
   * Registra un latido del visor de curso para contabilizar tiempo real de estudio.
   *
   * Si el último latido llegó hace poco se alarga la sesión abierta; si hubo un hueco
   * largo se abre una nueva, que empieza en cero. Se suma el **tiempo transcurrido de
   * verdad** desde el latido anterior y no una cantidad fija por latido: así dos pestañas
   * abiertas o una recarga no cuentan de más, y una pestaña olvidada no suma horas porque
   * el cliente deja de latir cuando no está visible.
   *
   * Con el curso sin publicar (en mantenimiento) el latido se ignora: no hay contenido que
   * estudiar, sólo el aviso.
   */
  async recordHeartbeat(courseGuid: string, user: JwtPayload) {
    const course = await this.access.courseInCountry(courseGuid, user.country);
    await this.access.ensureEnrollment(courseGuid, user.sub);
    if (course.status !== 'PUBLISHED') return { recorded: false };

    const now = new Date();
    const cutoff = new Date(now.getTime() - SESSION_CUTOFF_SECONDS * 1000);

    const openSession = await this.prisma.studySession.findFirst({
      where: { userGuid: user.sub, courseGuid, endedAt: { gte: cutoff } },
      orderBy: { endedAt: 'desc' },
      select: { id: true, durationSeconds: true, endedAt: true },
    });

    if (!openSession) {
      await this.prisma.studySession.create({
        data: { userGuid: user.sub, courseGuid, startedAt: now, endedAt: now, durationSeconds: 0 },
      });
      return { recorded: true };
    }

    // La fila se eligió por tener `endedAt` reciente, así que no puede ser nulo; el respaldo
    // sólo satisface al sistema de tipos.
    const lastHeartbeat = openSession.endedAt ?? now;
    const elapsed = Math.round((now.getTime() - lastHeartbeat.getTime()) / 1000);
    const toAdd = Math.min(Math.max(elapsed, 0), SESSION_CUTOFF_SECONDS);

    await this.prisma.studySession.update({
      where: { id: openSession.id },
      data: { endedAt: now, durationSeconds: openSession.durationSeconds + toAdd },
    });

    return { recorded: true };
  }
}
