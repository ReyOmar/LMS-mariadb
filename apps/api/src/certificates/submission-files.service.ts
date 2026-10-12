import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FileOwnershipService } from '../storage/file-ownership.service';
import { AFTER_LOCK, lockEnrollment } from '../enrollments/enrollment-lock';

/** La vuelta de un alumno por un curso. */
export interface Round {
  userGuid: string;
  courseGuid: string;
}

/** Vueltas que se leen de una vez al ponerlas al día. */
const ROUNDS_PER_BATCH = 100;

/**
 * Archivos que entregan los alumnos. Al emitirse el certificado de una vuelta se borran del
 * disco, y sus entregas conservan el nombre del archivo, el estado, la nota y el comentario.
 */
@Injectable()
export class SubmissionFilesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SubmissionFilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FileOwnershipService,
  ) {}

  /**
   * Marca como retiradas las entregas con archivo de la vuelta, dentro de la transacción de quien
   * llama, y devuelve sus claves. Se borran con `deleteRetired` sólo cuando esa transacción se
   * confirma: si se deshiciera, las entregas apuntarían a archivos que ya no existen.
   */
  async retireRound(tx: Prisma.TransactionClient, { userGuid, courseGuid }: Round): Promise<string[]> {
    const withFile = await tx.submission.findMany({
      where: { userGuid, attachmentKey: { not: null }, assignment: { module: { courseGuid } } },
      select: { guid: true, attachmentKey: true },
    });
    if (withFile.length === 0) return [];

    await tx.submission.updateMany({
      where: { guid: { in: withFile.map((submission) => submission.guid) } },
      data: { attachmentKey: null, filePurged: true },
    });
    return withFile.flatMap((submission) => (submission.attachmentKey ? [submission.attachmentKey] : []));
  }

  /** Borra del disco lo que `retireRound` retiró. No falla: lo que no puede borrar lo registra. */
  deleteRetired(keys: string[]): Promise<void> {
    return this.files.deleteUnreferenced(keys);
  }

  /** En segundo plano: con muchas vueltas pendientes, esperarlas retrasaría el arranque. */
  onApplicationBootstrap(): void {
    void this.retireCertifiedRounds()
      .then((retired) => {
        if (retired > 0) this.logger.log(`Retirados ${retired} archivos de entregas de vueltas ya certificadas`);
      })
      .catch((error) => this.logger.error('No se pudieron retirar los archivos de las vueltas ya certificadas', error));
  }

  /**
   * Retira los archivos de las vueltas certificadas que aún los conservan, como si se emitiera
   * ahora su certificado. Sin pendientes no hace nada, así que puede repetirse en cada arranque.
   *
   * @returns cuántos archivos retiró.
   */
  async retireCertifiedRounds(): Promise<number> {
    let retired = 0;
    for (;;) {
      const rounds = await this.certifiedRoundsWithFiles();
      for (const round of rounds) retired += await this.retireCertifiedRound(round);
      if (rounds.length < ROUNDS_PER_BATCH) return retired;
    }
  }

  /** Parte de las entregas con archivo, que son las de las vueltas en curso: no recorre el historial. */
  private certifiedRoundsWithFiles(): Promise<Round[]> {
    return this.prisma.$queryRaw<Round[]>`
      SELECT DISTINCT e.usuario_guid AS userGuid, m.curso_guid AS courseGuid
      FROM lms_entregas e
      JOIN lms_recursos r ON r.guid = e.tarea_guid
      JOIN lms_modulos m ON m.guid = r.modulo_guid
      JOIN lms_matriculas mt ON mt.usuario_guid = e.usuario_guid AND mt.curso_guid = m.curso_guid
      WHERE e.url_archivo_adjunto IS NOT NULL AND mt.fecha_finalizacion IS NOT NULL
      LIMIT ${ROUNDS_PER_BATCH}`;
  }

  /** Con la matrícula bloqueada, como al emitir: una vuelta reabierta entretanto ya no se toca. */
  private async retireCertifiedRound(round: Round): Promise<number> {
    const keys = await this.prisma.$transaction(async (tx) => {
      const enrollment = await lockEnrollment(tx, round.userGuid, round.courseGuid);
      return enrollment?.completedAt ? this.retireRound(tx, round) : [];
    }, AFTER_LOCK);

    await this.deleteRetired(keys);
    return keys.length;
  }
}
