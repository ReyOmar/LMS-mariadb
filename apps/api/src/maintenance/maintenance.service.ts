import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { recordCompletion } from '../courses/resource-progress';
import { AUTO_UNLOCK_HOURS } from '../courses/progression';
import { Country } from '../common/domain/country';
import { plural } from '../common/domain/text';

/** Días sin entrar tras los cuales se envía un recordatorio. */
const INACTIVITY_DAYS = 3;

/** Filas que se leen de una vez al recorrer una tabla entera. */
const BATCH_SIZE = 500;

/** Recordatorios que se envían a la vez: acota las conexiones y el ritmo contra el correo. */
const REMINDER_CONCURRENCY = 5;

/**
 * Zona en la que se leen las horas de las tareas programadas, sea cual sea la del servidor.
 * Es la de Colombia; México (America/Mexico_City) va una hora por detrás todo el año —ninguno
 * de los dos cambia de horario—, así que «las 8:00» son las 7:00 allí.
 */
const SCHEDULE_TIME_ZONE = 'America/Bogota';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Tareas de mantenimiento.
 *
 * **Ninguna borra archivos.** Un archivo sólo se retira cuando alguien elimina o sustituye
 * aquello a lo que pertenece (ver «¿Cuándo se borra un archivo?» en `docs/DECISIONES.md`),
 * y por eso este servicio no recibe el almacenamiento.
 *
 * Todas llevan un candado en memoria que evita que una ejecución arranque mientras la
 * anterior sigue viva. En cPanel sólo corre una instancia del proceso, así que basta;
 * si algún día se levantan varias, habrá que mover el candado a la base de datos.
 *
 * Las que recorren tablas lo hacen en tandas ordenadas por `guid`, de modo que ninguna
 * fila se queda sin atender por muchas que haya delante.
 */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);
  private readonly inProgress = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  /** Ejecuta una tarea evitando solapes y registrando su resultado. */
  private async run(name: string, task: () => Promise<string | void>): Promise<void> {
    if (this.inProgress.has(name)) {
      this.logger.warn(`Se omite "${name}": la ejecución anterior sigue en curso.`);
      return;
    }

    this.inProgress.add(name);
    const start = Date.now();
    try {
      const summary = await task();
      if (summary) this.logger.log(`${name}: ${summary} (${Date.now() - start} ms)`);
    } catch (error) {
      this.logger.error(`${name} falló`, error);
    } finally {
      this.inProgress.delete(name);
    }
  }

  /**
   * Recorre en tandas las filas que devuelve `page` a partir del último `guid` visto, hasta
   * agotarlas. Así la memoria no crece con la tabla y ninguna fila queda fuera por un tope.
   */
  private async forEachBatch<T extends { guid: string }>(
    page: (after: string | undefined) => Promise<T[]>,
    handle: (batch: T[]) => Promise<void>,
  ): Promise<void> {
    let after: string | undefined;
    for (;;) {
      const batch = await page(after);
      if (batch.length > 0) await handle(batch);
      if (batch.length < BATCH_SIZE) return;
      after = batch[batch.length - 1].guid;
    }
  }

  // ── Recordatorios ────────────────────────────────────────────────────────

  /**
   * Recuerda a los alumnos inactivos que tienen formación pendiente. Cada día a las 8:00.
   *
   * Pendiente quiere decir una matrícula activa **sin terminar**: quien ya se certificó
   * sigue matriculado —conserva el acceso al curso y al chat—, pero no tiene nada que
   * retomar y no debe recibir el aviso.
   */
  @Cron('0 8 * * *', { timeZone: SCHEDULE_TIME_ZONE })
  sendInactivityReminders(): Promise<void> {
    return this.run('recordatorio de inactividad', async () => {
      const cutoff = new Date(Date.now() - INACTIVITY_DAYS * DAY_MS);
      let sent = 0;
      let failed = 0;

      await this.forEachBatch(
        (after) =>
          this.prisma.user.findMany({
            where: {
              ...(after ? { guid: { gt: after } } : {}),
              role: 'STUDENT',
              OR: [{ lastAccessAt: { lt: cutoff } }, { lastAccessAt: null }],
              // Sólo tiene sentido avisar a quien tiene formación sin terminar…
              enrollments: { some: { active: true, completedAt: null } },
              // …y a quien no se avisó ya en este mismo periodo.
              notifications: { none: { type: 'INACTIVITY_REMINDER', createdAt: { gt: cutoff } } },
            },
            select: { guid: true, email: true, firstName: true, country: true, lastAccessAt: true },
            orderBy: { guid: 'asc' },
            take: BATCH_SIZE,
          }),
        async (students) => {
          // De pocos en pocos: uno a uno la tarea duraría horas con miles de alumnos, y todos
          // a la vez agotarían las conexiones y saturarían el servidor de correo.
          for (let i = 0; i < students.length; i += REMINDER_CONCURRENCY) {
            const results = await Promise.allSettled(
              students.slice(i, i + REMINDER_CONCURRENCY).map((student) => this.remind(student)),
            );
            for (const result of results) {
              if (result.status === 'fulfilled') sent++;
              else failed++;
            }
          }
        },
      );

      // A quien falló no le consta el aviso: mañana vuelve a entrar en la lista.
      if (failed > 0) this.logger.warn(`${failed} recordatorio(s) no se pudieron enviar`);
      return `${sent} recordatorio(s) enviados`;
    });
  }

  private async remind(student: {
    guid: string;
    email: string;
    firstName: string;
    country: Country;
    lastAccessAt: Date | null;
  }): Promise<void> {
    const days = student.lastAccessAt
      ? Math.floor((Date.now() - student.lastAccessAt.getTime()) / DAY_MS)
      : INACTIVITY_DAYS;

    await this.notifications.create({
      userGuid: student.guid,
      country: student.country,
      type: 'INACTIVITY_REMINDER',
      title: 'Tienes formación pendiente',
      message: `Llevas ${days} ${plural(days, 'día', 'días')} sin entrar. Retoma tus cursos cuando puedas.`,
      actionUrl: '/dashboard',
    });
    await this.mail.sendInactivityReminder(student.email, student.firstName, days, student.country);
  }

  // ── Desbloqueo por espera ────────────────────────────────────────────────

  /**
   * Desbloquea el avance de quien lleva más de 48 h esperando una calificación y sigue
   * matriculado en el curso.
   *
   * No da la tarea por aprobada: sólo crea el registro de progreso que permite pasar al
   * siguiente recurso. El certificado sigue exigiendo que todas las tareas estén
   * calificadas, y suspender la tarea retira ese avance.
   */
  @Cron('0 * * * *', { timeZone: SCHEDULE_TIME_ZONE })
  unlockLongWaits(): Promise<void> {
    return this.run('desbloqueo por espera', async () => {
      const cutoff = new Date(Date.now() - AUTO_UNLOCK_HOURS * 60 * 60 * 1000);
      let unlocked = 0;

      await this.forEachBatch(
        (after) =>
          this.prisma.submission.findMany({
            where: {
              ...(after ? { guid: { gt: after } } : {}),
              status: { in: ['SUBMITTED', 'IN_REVIEW'] },
              submittedAt: { lt: cutoff },
              assignmentGuid: { not: null },
            },
            select: {
              guid: true,
              userGuid: true,
              assignmentGuid: true,
              user: { select: { country: true } },
              assignment: { select: { title: true, module: { select: { courseGuid: true } } } },
            },
            orderBy: { guid: 'asc' },
            take: BATCH_SIZE,
          }),
        async (pending) => {
          // Qué avances y qué matrículas activas hay, una consulta por tanda y no por fila:
          // lo normal es que casi todas estén ya desbloqueadas de pasadas anteriores.
          const [alreadyUnlocked, enrolled] = await Promise.all([
            this.existingProgress(pending),
            this.activeEnrollments(pending),
          ]);

          for (const submission of pending) {
            const courseGuid = submission.assignment?.module.courseGuid;
            if (!submission.assignmentGuid || !courseGuid) continue;
            if (alreadyUnlocked.has(`${submission.userGuid}|${submission.assignmentGuid}`)) continue;
            if (!enrolled.has(`${submission.userGuid}|${courseGuid}`)) continue;

            await recordCompletion(this.prisma, submission.userGuid, submission.assignmentGuid, courseGuid);
            unlocked++;

            await this.notifications.create({
              userGuid: submission.userGuid,
              country: submission.user.country,
              type: 'MODULE_COMPLETED',
              title: 'Puedes continuar con el curso',
              message:
                `Tu tarea "${submission.assignment?.title ?? 'pendiente'}" lleva más de ${AUTO_UNLOCK_HOURS} horas ` +
                'esperando calificación, así que hemos desbloqueado el siguiente recurso. La tarea sigue pendiente de revisión.',
              actionUrl: '/dashboard/student/courses',
            });
          }
        },
      );

      return `${unlocked} recurso(s) desbloqueados`;
    });
  }

  /**
   * Pares «alumno|recurso» que ya tienen avance, para las entregas indicadas.
   *
   * Se piden por separado los alumnos y los recursos, así que la consulta devuelve algún
   * par de más; da igual, sólo se consulta la pertenencia de los pares exactos.
   */
  private async existingProgress(
    submissions: readonly { userGuid: string; assignmentGuid: string | null }[],
  ): Promise<Set<string>> {
    const students = [...new Set(submissions.map((submission) => submission.userGuid))];
    const resources = [
      ...new Set(submissions.flatMap((submission) => (submission.assignmentGuid ? [submission.assignmentGuid] : []))),
    ];
    if (resources.length === 0) return new Set();

    const progress = await this.prisma.resourceProgress.findMany({
      where: { userGuid: { in: students }, resourceGuid: { in: resources } },
      select: { userGuid: true, resourceGuid: true },
    });
    return new Set(progress.map((row) => `${row.userGuid}|${row.resourceGuid}`));
  }

  /** Pares «alumno|curso» con matrícula activa, para las entregas indicadas. */
  private async activeEnrollments(
    submissions: readonly { userGuid: string; assignment: { module: { courseGuid: string } } | null }[],
  ): Promise<Set<string>> {
    const students = [...new Set(submissions.map((submission) => submission.userGuid))];
    const courses = [
      ...new Set(
        submissions.flatMap((submission) => (submission.assignment ? [submission.assignment.module.courseGuid] : [])),
      ),
    ];
    if (courses.length === 0) return new Set();

    const enrollments = await this.prisma.enrollment.findMany({
      where: { userGuid: { in: students }, courseGuid: { in: courses }, active: true },
      select: { userGuid: true, courseGuid: true },
    });
    return new Set(enrollments.map((row) => `${row.userGuid}|${row.courseGuid}`));
  }

  // ── Recuento de avance ───────────────────────────────────────────────────

  /**
   * Recalcula `recursos_completados` en las matrículas en curso. Cada noche a las 3:15.
   *
   * Los servicios lo mantienen al día cada vez que cambia el avance, pero borrar un recurso
   * o un módulo retira el progreso en cascada, dentro de la base, sin pasar por ellos. Las
   * matrículas terminadas no se revisan: el monitoreo no las lee.
   */
  @Cron('15 3 * * *', { timeZone: SCHEDULE_TIME_ZONE })
  reconcileCompletedResources(): Promise<void> {
    return this.run('recuento de avance', async () => {
      let reviewed = 0;
      let after = 0;

      for (;;) {
        const batch = await this.prisma.enrollment.findMany({
          where: { id: { gt: after }, active: true, completedAt: null },
          select: { id: true },
          orderBy: { id: 'asc' },
          take: BATCH_SIZE,
        });
        if (batch.length === 0) break;

        const ids = batch.map((enrollment) => enrollment.id);
        await this.prisma.$executeRaw`
          UPDATE lms_matriculas m
          SET m.recursos_completados = (
            SELECT COUNT(*)
            FROM lms_progreso_recurso p
            JOIN lms_recursos r ON r.guid = p.recurso_guid
            JOIN lms_modulos mo ON mo.guid = r.modulo_guid
            WHERE p.usuario_guid = m.usuario_guid AND mo.curso_guid = m.curso_guid
          )
          WHERE m.id IN (${Prisma.join(ids)})`;

        reviewed += batch.length;
        if (batch.length < BATCH_SIZE) break;
        after = ids[ids.length - 1];
      }

      return `${reviewed} matrícula(s) en curso revisadas`;
    });
  }

  // ── Limpieza de datos temporales ─────────────────────────────────────────

  /**
   * Borra códigos de verificación y enlaces de recuperación caducados.
   * Son secretos de un solo uso: conservarlos pasada su vigencia no aporta nada y alarga
   * innecesariamente la ventana en que podrían filtrarse.
   */
  @Cron('30 3 * * *', { timeZone: SCHEDULE_TIME_ZONE })
  cleanTemporaryData(): Promise<void> {
    return this.run('limpieza de datos temporales', async () => {
      const now = new Date();
      const [verifications, passwordResets] = await Promise.all([
        this.prisma.emailVerification.deleteMany({ where: { expiresAt: { lt: now } } }),
        this.prisma.passwordReset.deleteMany({ where: { expiresAt: { lt: now } } }),
      ]);

      return `${verifications.count} código(s) y ${passwordResets.count} enlace(s) caducados borrados`;
    });
  }

  /**
   * Borra los mensajes que **las dos partes** han vaciado de su bandeja.
   *
   * Vaciar una conversación oculta la copia de quien lo pide y deja intacta la de la otra
   * persona, así que el mensaje tiene que seguir en la base mientras alguien pueda verlo.
   * Cuando los dos lo han ocultado ya no queda nadie a quien enseñárselo, y conservarlo
   * sólo haría crecer la tabla con contenido invisible.
   */
  @Cron('45 3 * * *', { timeZone: SCHEDULE_TIME_ZONE })
  cleanHiddenMessages(): Promise<void> {
    return this.run('limpieza de mensajes ocultos', async () => {
      const cutoffs = await this.prisma.hiddenConversation.findMany({
        select: { userGuid: true, contactGuid: true, hiddenUntil: true },
      });
      if (cutoffs.length === 0) return 'sin conversaciones vaciadas';

      const cutoffByPair = new Map(
        cutoffs.map((cutoff) => [`${cutoff.userGuid}|${cutoff.contactGuid}`, cutoff.hiddenUntil]),
      );

      // Sólo interesan las parejas en las que ambos lados han vaciado: el mensaje se borra
      // hasta el más antiguo de los dos cortes, que es lo que ninguno de los dos ve.
      let deleted = 0;
      const seenPairs = new Set<string>();

      for (const cutoff of cutoffs) {
        const pair = [cutoff.userGuid, cutoff.contactGuid].sort().join('|');
        if (seenPairs.has(pair)) continue;
        seenPairs.add(pair);

        const otherCutoff = cutoffByPair.get(`${cutoff.contactGuid}|${cutoff.userGuid}`);
        if (!otherCutoff) continue;

        const limit = cutoff.hiddenUntil < otherCutoff ? cutoff.hiddenUntil : otherCutoff;
        const { count } = await this.prisma.message.deleteMany({
          where: {
            createdAt: { lte: limit },
            OR: [
              { senderGuid: cutoff.userGuid, recipientGuid: cutoff.contactGuid },
              { senderGuid: cutoff.contactGuid, recipientGuid: cutoff.userGuid },
            ],
          },
        });
        deleted += count;
      }

      return `${deleted} mensaje(s) ocultos por ambas partes borrados`;
    });
  }
}
