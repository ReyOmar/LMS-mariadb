import { SubmissionFilesService, Round } from './submission-files.service';
import { fileOwnershipDouble } from '../common/testing/file-ownership-double';

/**
 * Las vueltas que se certificaron antes de que la emisión retirara los archivos entregados.
 *
 * Al arrancar se ponen al día con la misma retirada que hace la emisión, sin scripts aparte:
 * la consulta parte de las entregas que aún tienen archivo, así que cuando no queda ninguna
 * pendiente no hace nada y puede repetirse en cada arranque.
 */

interface Row {
  guid: string;
  userGuid: string;
  courseGuid: string;
  attachmentKey: string | null;
  filePurged: boolean;
}

function delivery(guid: string, round: Round): Row {
  return { guid, ...round, attachmentKey: `entregas/${guid}.pdf`, filePurged: false };
}

const ANA_CERTIFIED: Round = { userGuid: 'ana', courseGuid: 'curso-1' };
const ANA_IN_PROGRESS: Round = { userGuid: 'ana', courseGuid: 'curso-2' };
const BETO_CERTIFIED: Round = { userGuid: 'beto', courseGuid: 'curso-1' };

/** Base en memoria: matrículas terminadas o en curso y entregas con o sin archivo. */
function campus({ reopenedMeanwhile = false, failQuery = false, otherCertifiedStudents = 0 } = {}) {
  const others = Array.from({ length: otherCertifiedStudents }, (_, i) => ({
    userGuid: `alumno-${i}`,
    courseGuid: 'curso-1',
  }));
  const certified = [ANA_CERTIFIED, BETO_CERTIFIED, ...others];
  const isCertified = (round: Round) =>
    certified.some((other) => other.userGuid === round.userGuid && other.courseGuid === round.courseGuid);
  let rows: Row[] = [
    delivery('informe-ana', ANA_CERTIFIED),
    delivery('mapa-ana', ANA_CERTIFIED),
    delivery('informe-beto', BETO_CERTIFIED),
    delivery('borrador-ana', ANA_IN_PROGRESS),
    ...others.map((round) => delivery(`informe-${round.userGuid}`, round)),
  ];
  const queries: string[] = [];
  let lockedRound: Round | null = null;

  const prisma = {
    $queryRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
      const text = sql.join('?');
      if (text.includes('FOR UPDATE')) {
        lockedRound = { userGuid: values[0] as string, courseGuid: values[1] as string };
        const completed = isCertified(lockedRound) && !reopenedMeanwhile;
        return [{ active: 1, completedAt: completed ? new Date('2025-06-01') : null }];
      }
      if (failQuery) throw new Error('la base no responde');
      queries.push(text);
      const limit = values[values.length - 1] as number;
      const pending = rows.filter((row) => row.attachmentKey && isCertified(row));
      const rounds = [...new Map(pending.map((row) => [`${row.userGuid}|${row.courseGuid}`, row])).values()];
      return rounds.slice(0, limit).map(({ userGuid, courseGuid }) => ({ userGuid, courseGuid }));
    },
    $transaction: async (work: (tx: unknown) => Promise<unknown>) => work(prisma),
    submission: {
      findMany: async ({ where }: { where: { userGuid: string; assignment: { module: { courseGuid: string } } } }) =>
        rows.filter(
          (row) =>
            row.attachmentKey &&
            row.userGuid === where.userGuid &&
            row.courseGuid === where.assignment.module.courseGuid,
        ),
      updateMany: async ({ where, data }: { where: { guid: { in: string[] } }; data: Partial<Row> }) => {
        rows = rows.map((row) => (where.guid.in.includes(row.guid) ? { ...row, ...data } : row));
        return { count: where.guid.in.length };
      },
    },
  };

  const ownership = fileOwnershipDouble();
  const service = new SubmissionFilesService(prisma as never, ownership.files);
  return { service, queries, rows: () => rows, retired: ownership.retired };
}

describe('SubmissionFilesService · vueltas ya certificadas', () => {
  it('retira los archivos de las vueltas certificadas que aún los conservan', async () => {
    const { service, retired, rows } = campus();

    await expect(service.retireCertifiedRounds()).resolves.toBe(3);

    expect(retired()).toEqual(['entregas/informe-ana.pdf', 'entregas/mapa-ana.pdf', 'entregas/informe-beto.pdf']);
    expect(
      rows()
        .filter((row) => row.filePurged)
        .map((row) => row.guid),
    ).toEqual(['informe-ana', 'mapa-ana', 'informe-beto']);
  });

  it('no toca la vuelta en curso del mismo alumno en otro curso', async () => {
    const { service, rows } = campus();

    await service.retireCertifiedRounds();

    expect(rows().find((row) => row.guid === 'borrador-ana')).toMatchObject({
      attachmentKey: 'entregas/borrador-ana.pdf',
      filePurged: false,
    });
  });

  it('una segunda pasada no encuentra nada que hacer', async () => {
    const { service, retired } = campus();
    await service.retireCertifiedRounds();

    await expect(service.retireCertifiedRounds()).resolves.toBe(0);
    expect(retired()).toHaveLength(3);
  });

  it('no toca una vuelta que se reabrió entre la consulta y el bloqueo', async () => {
    const { service, retired, rows } = campus({ reopenedMeanwhile: true });

    await expect(service.retireCertifiedRounds()).resolves.toBe(0);

    expect(retired()).toEqual([]);
    expect(rows().every((row) => row.attachmentKey)).toBe(true);
  });

  it('recorre las tandas hasta que no queda ninguna vuelta pendiente', async () => {
    const { service, rows } = campus({ otherCertifiedStudents: 250 });

    await expect(service.retireCertifiedRounds()).resolves.toBe(253);

    expect(
      rows()
        .filter((row) => row.attachmentKey)
        .map((row) => row.guid),
    ).toEqual(['borrador-ana']);
  });

  it('parte de las entregas con archivo de matrículas terminadas, en tandas acotadas', async () => {
    const { service, queries } = campus();

    await service.retireCertifiedRounds();

    expect(queries[0]).toMatch(/url_archivo_adjunto IS NOT NULL AND mt\.fecha_finalizacion IS NOT NULL/);
    expect(queries[0]).toMatch(/LIMIT \?/);
  });

  it('al arrancar, un fallo se registra y no impide que la API siga', async () => {
    const { service } = campus({ failQuery: true });
    const logged = new Promise((resolve) => {
      jest.spyOn(service['logger'], 'error').mockImplementation(resolve);
    });

    expect(() => service.onApplicationBootstrap()).not.toThrow();
    await expect(logged).resolves.toMatch(/vueltas ya certificadas/);
  });
});
