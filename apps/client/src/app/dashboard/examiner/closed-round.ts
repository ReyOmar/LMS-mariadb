import type { ExaminerSubmission } from './types';

/** Un alumno terminó su vuelta por un curso: se le emitió el certificado. */
export interface ClosedRound {
  courseGuid: string;
  userGuid: string;
}

/** Sus entregas cargadas de ese curso pierden el archivo, retirado al certificar, y su nota queda cerrada. */
export function closeRoundOf<T extends ExaminerSubmission>(submissions: T[], round: ClosedRound): T[] {
  return submissions.map((submission) =>
    submission.student?.guid === round.userGuid && submission.courseGuid === round.courseGuid
      ? {
          ...submission,
          fileUrl: null,
          filePurged: submission.filePurged || Boolean(submission.fileUrl),
          roundClosed: true,
        }
      : submission,
  );
}
