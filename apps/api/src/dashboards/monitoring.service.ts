import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CourseAccessService } from '../courses/course-access.service';
import { roundedMean, percent, progressRange } from '../common/domain/progress';
import { encodeCursor, rowsPerPage, decodeCursor } from '../common/domain/pagination';
import { timeZoneOffset } from '../common/domain/time-zone';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { MonitoringFilterDto } from './dto/monitoring-filter.dto';
import { SYLLABUS_ORDER } from '../courses/syllabus-order';
import { personSearchSql } from '../prisma/person-search';

interface Scope {
  /** Cursos que gestiona quien consulta, para el selector de la pantalla. */
  courses: { guid: string; title: string }[];
  /** Cursos que entran en las cifras: todos esos, o sólo el elegido. */
  guids: string[];
}

interface PageRow {
  guid: string;
  firstName: string;
  lastName: string;
  email: string;
  lastAccessAt: Date | null;
  createdAt: Date;
}

/** Matrícula en curso: activa y sin terminar. `m` es el alias de `lms_matriculas`. */
const IN_PROGRESS = Prisma.sql`m.activa = 1 AND m.fecha_finalizacion IS NULL`;

/**
 * Monitoreo de alumnos del examinador: el seguimiento de la formación **en curso**.
 *
 * Las cifras y las gráficas salen de agregados de la base sobre todos los alumnos que
 * coinciden con el filtro; la lista va por páginas y cada fila lleva un resumen por
 * curso. El desglose por módulo se pide aparte, al desplegar un curso.
 *
 * Sólo cuentan las matrículas activas **sin terminar**. Quien ya se certificó conserva su
 * matrícula —sigue viendo el curso y escribiendo a su profesor—, pero no tiene avance que
 * seguir; contarle haría crecer cada consulta con los años sin decir nada nuevo. Cifras y
 * lista eligen a los alumnos con las mismas condiciones (`studentsSql` e `inProgressIn`):
 * la gráfica y la tabla hablan siempre de las mismas personas.
 */
@Injectable()
export class MonitoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly access: CourseAccessService,
  ) {}

  /** Recuentos, reparto por tramo de avance y accesos por día de la semana. */
  async getSummary(user: JwtPayload, filter: MonitoringFilterDto) {
    const scope = await this.scope(user, filter.course);
    const summary = {
      courses: scope.courses,
      students: 0,
      withSubmissions: 0,
      totalSubmissions: 0,
      ranges: [0, 0, 0, 0],
      loginsPerDay: [0, 0, 0, 0, 0, 0, 0],
    };
    if (scope.guids.length === 0) return summary;

    const { timeZone } = await this.settings.getSettings(user.country);
    const students = this.studentsSql(user, filter.search);
    const courses = Prisma.join(scope.guids);

    // Una consulta tras otra y no a la vez: cada una ocupa una conexión mientras dura.
    const logins = await this.prisma.$queryRaw<{ weekday: number | bigint | null; students: bigint }[]>`
      SELECT DAYOFWEEK(CONVERT_TZ(u.ultimo_acceso, '+00:00', ${timeZoneOffset(timeZone)})) AS weekday,
             COUNT(*) AS students
      FROM usuarios u
      WHERE ${students} AND ${this.inProgressIn(scope.guids)}
      GROUP BY weekday`;
    const ranges = await this.progressRanges(students, scope.guids);
    // Entregas de las matrículas en curso: parte de ellas y busca las de cada alumno en las
    // tareas de su curso, sin recorrer las de quien ya terminó. Un intento de cuestionario
    // abierto todavía no es una entrega.
    const submissions = await this.prisma.$queryRaw<{ withSubmissions: bigint; total: bigint }[]>`
      SELECT COUNT(DISTINCT e.usuario_guid) AS withSubmissions, COUNT(*) AS total
      FROM lms_matriculas m
      JOIN usuarios u ON u.guid = m.usuario_guid
      JOIN lms_modulos mo ON mo.curso_guid = m.curso_guid
      JOIN lms_recursos r ON r.modulo_guid = mo.guid
      JOIN lms_entregas e ON e.tarea_guid = r.guid AND e.usuario_guid = m.usuario_guid AND e.estado <> 'BORRADOR'
      WHERE ${IN_PROGRESS} AND m.curso_guid IN (${courses}) AND ${students}`;

    // DAYOFWEEK va de 1 (domingo) a 7; la gráfica, como getDay(), de 0 a 6.
    for (const row of logins) {
      summary.students += Number(row.students);
      if (row.weekday !== null) summary.loginsPerDay[Number(row.weekday) - 1] = Number(row.students);
    }
    summary.ranges = ranges;
    summary.withSubmissions = Number(submissions[0]?.withSubmissions ?? 0);
    summary.totalSubmissions = Number(submissions[0]?.total ?? 0);
    return summary;
  }

  /**
   * Alumnos por tramo de avance: la media de sus cursos en curso, o el avance en el curso
   * elegido.
   *
   * El avance de cada matrícula sale de su recuento guardado (`recursos_completados`) y no
   * de agrupar el progreso: con años de historia eso eran millones de filas y segundos por
   * consulta. La media se hace aquí, con las mismas funciones que las filas de la lista.
   */
  private async progressRanges(students: Prisma.Sql, courses: string[]): Promise<number[]> {
    const courseListSql = Prisma.join(courses);
    const enrollments = await this.prisma.$queryRaw<{ userGuid: string; courseGuid: string; done: number | bigint }[]>`
      SELECT m.usuario_guid AS userGuid, m.curso_guid AS courseGuid, m.recursos_completados AS done
      FROM lms_matriculas m
      JOIN usuarios u ON u.guid = m.usuario_guid
      WHERE ${IN_PROGRESS} AND m.curso_guid IN (${courseListSql}) AND ${students}`;
    const totals = await this.prisma.$queryRaw<{ courseGuid: string; total: bigint }[]>`
      SELECT mo.curso_guid AS courseGuid, COUNT(*) AS total
      FROM lms_recursos r
      JOIN lms_modulos mo ON mo.guid = r.modulo_guid
      WHERE mo.curso_guid IN (${courseListSql})
      GROUP BY mo.curso_guid`;

    const totalByCourse = new Map(totals.map((row) => [row.courseGuid, Number(row.total)]));

    const byStudent = new Map<string, number[]>();
    for (const { userGuid, courseGuid, done } of enrollments) {
      const total = totalByCourse.get(courseGuid) ?? 0;
      // Hasta la reconciliación nocturna, retirar un recurso puede dejar el recuento por encima.
      const progress = percent(Math.min(Number(done), total), total);
      const percents = byStudent.get(userGuid);
      if (percents) percents.push(progress);
      else byStudent.set(userGuid, [progress]);
    }

    const ranges = [0, 0, 0, 0];
    for (const percents of byStudent.values()) ranges[progressRange(roundedMean(percents))]++;
    return ranges;
  }

  /** Una página de alumnos, de la alta más reciente a la más antigua. */
  async getStudents(user: JwtPayload, filter: MonitoringFilterDto) {
    const scope = await this.scope(user, filter.course);
    if (scope.guids.length === 0) return { cursor: null, students: [] };

    const take = rowsPerPage(filter.limit);
    const cursor = decodeCursor(filter.cursor);
    const fromCursor = cursor
      ? Prisma.sql`AND (u.created_at < ${cursor.date} OR (u.created_at = ${cursor.date} AND u.guid < ${cursor.id}))`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<PageRow[]>`
      SELECT u.guid, u.nombre AS firstName, u.apellido AS lastName, u.email, u.ultimo_acceso AS lastAccessAt, u.created_at AS createdAt
      FROM usuarios u
      WHERE ${this.studentsSql(user, filter.search)} AND ${this.inProgressIn(scope.guids)} ${fromCursor}
      ORDER BY u.created_at DESC, u.guid DESC
      LIMIT ${take + 1}`;

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const last = page[page.length - 1];

    return {
      cursor: hasMore && last ? encodeCursor(last.createdAt, last.guid) : null,
      students: await this.progressOf(page, scope),
    };
  }

  /** Avance módulo a módulo de un alumno en un curso que gestiona quien consulta. */
  async getStudentModules(courseGuid: string, studentGuid: string, user: JwtPayload) {
    await this.access.managedCourse(courseGuid, user);

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userGuid_courseGuid: { userGuid: studentGuid, courseGuid } },
      select: { active: true },
    });
    if (!enrollment?.active) throw new NotFoundException('El alumno no está matriculado en este curso.');

    const [modules, done] = await Promise.all([
      this.prisma.courseModule.findMany({
        where: { courseGuid },
        orderBy: SYLLABUS_ORDER,
        select: { guid: true, title: true, _count: { select: { resources: true } } },
      }),
      this.completedByModule([studentGuid], [courseGuid]),
    ]);

    return {
      modules: modules.map((module) => {
        const total = module._count.resources;
        const completed = done.get(`${studentGuid}|${module.guid}`) ?? 0;
        return {
          guid: module.guid,
          title: module.title,
          total,
          completed,
          percent: percent(completed, total),
        };
      }),
    };
  }

  /**
   * Cursos que gestiona quien consulta. El administrador ve los de su sede y el profesor
   * sólo los suyos; ni la sede ni el profesor llegan nunca de la petición.
   */
  private async scope(user: JwtPayload, courseGuid?: string): Promise<Scope> {
    const courses = await this.prisma.course.findMany({
      where: { country: user.country, ...(user.role === 'TEACHER' ? { teacherGuid: user.sub } : {}) },
      select: { guid: true, title: true },
      orderBy: { title: 'asc' },
    });
    if (!courseGuid) return { courses, guids: courses.map((course) => course.guid) };

    if (!courses.some((course) => course.guid === courseGuid)) throw new NotFoundException('Curso no encontrado.');
    return { courses, guids: [courseGuid] };
  }

  /** Alumnos de la sede (alias `u`) que casan con la búsqueda. */
  private studentsSql(user: JwtPayload, search?: string): Prisma.Sql {
    return Prisma.sql`u.pais = ${user.country} AND u.rol = 'ESTUDIANTE' ${personSearchSql(search)}`;
  }

  /** Que el alumno `u` tenga alguna matrícula en curso en los cursos dados. */
  private inProgressIn(courses: string[]): Prisma.Sql {
    return Prisma.sql`EXISTS (
        SELECT 1 FROM lms_matriculas m
        WHERE m.usuario_guid = u.guid AND ${IN_PROGRESS} AND m.curso_guid IN (${Prisma.join(courses)})
      )`;
  }

  /**
   * Resumen por curso de cada alumno de la página: avance, recursos y módulos terminados.
   * Como las cifras, sólo trae sus cursos en curso.
   */
  private async progressOf(page: PageRow[], scope: Scope) {
    if (page.length === 0) return [];
    const users = page.map((row) => row.guid);

    const enrollments = await this.prisma.enrollment.findMany({
      where: { userGuid: { in: users }, courseGuid: { in: scope.guids }, active: true, completedAt: null },
      select: { userGuid: true, courseGuid: true },
    });
    const pageCourses = [...new Set(enrollments.map((enrollment) => enrollment.courseGuid))];

    const [modules, done, submissions] = await Promise.all([
      this.prisma.courseModule.findMany({
        where: { courseGuid: { in: pageCourses } },
        select: { guid: true, courseGuid: true, _count: { select: { resources: true } } },
      }),
      this.completedByModule(users, pageCourses),
      this.prisma.$queryRaw<{ userGuid: string; submissions: bigint }[]>`
        SELECT m.usuario_guid AS userGuid, COUNT(*) AS submissions
        FROM lms_matriculas m
        JOIN lms_modulos mo ON mo.curso_guid = m.curso_guid
        JOIN lms_recursos r ON r.modulo_guid = mo.guid
        JOIN lms_entregas e ON e.tarea_guid = r.guid AND e.usuario_guid = m.usuario_guid AND e.estado <> 'BORRADOR'
        WHERE m.usuario_guid IN (${Prisma.join(users)}) AND m.curso_guid IN (${Prisma.join(scope.guids)})
          AND ${IN_PROGRESS}
        GROUP BY m.usuario_guid`,
    ]);

    const titles = new Map(scope.courses.map((course) => [course.guid, course.title]));
    const submissionsByStudent = new Map(submissions.map((row) => [row.userGuid, Number(row.submissions)]));
    const modulesByCourse = new Map<string, typeof modules>();
    for (const module of modules) {
      const courseModules = modulesByCourse.get(module.courseGuid);
      if (courseModules) courseModules.push(module);
      else modulesByCourse.set(module.courseGuid, [module]);
    }

    return page.map((student) => {
      const courses = enrollments
        .filter((enrollment) => enrollment.userGuid === student.guid)
        .map(({ courseGuid }) => {
          const moduleProgress = (modulesByCourse.get(courseGuid) ?? []).map((module) => ({
            total: module._count.resources,
            completed: done.get(`${student.guid}|${module.guid}`) ?? 0,
          }));
          const total = moduleProgress.reduce((sum, module) => sum + module.total, 0);
          const completed = moduleProgress.reduce((sum, module) => sum + module.completed, 0);
          return {
            courseGuid,
            courseTitle: titles.get(courseGuid) ?? '',
            percent: percent(completed, total),
            completed,
            totalResources: total,
            completedModules: moduleProgress.filter((module) => percent(module.completed, module.total) >= 100).length,
            totalModules: moduleProgress.length,
          };
        });

      return {
        guid: student.guid,
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.email,
        lastAccessAt: student.lastAccessAt,
        totalSubmissions: submissionsByStudent.get(student.guid) ?? 0,
        progress: roundedMean(courses.map((course) => course.percent)),
        courses,
      };
    });
  }

  /** Recursos completados por alumno y módulo, con clave `alumno|módulo`. */
  private async completedByModule(users: string[], courses: string[]): Promise<Map<string, number>> {
    if (users.length === 0 || courses.length === 0) return new Map();

    const rows = await this.prisma.$queryRaw<{ userGuid: string; moduleGuid: string; done: bigint }[]>`
      SELECT p.usuario_guid AS userGuid, r.modulo_guid AS moduleGuid, COUNT(*) AS done
      FROM lms_progreso_recurso p
      JOIN lms_recursos r ON r.guid = p.recurso_guid
      JOIN lms_modulos mo ON mo.guid = r.modulo_guid
      WHERE p.usuario_guid IN (${Prisma.join(users)}) AND mo.curso_guid IN (${Prisma.join(courses)})
      GROUP BY p.usuario_guid, r.modulo_guid`;

    return new Map(rows.map((row) => [`${row.userGuid}|${row.moduleGuid}`, Number(row.done)]));
  }
}
