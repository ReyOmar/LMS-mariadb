import type { SubmissionToGrade } from '@/types/models';

/** Entrega o intento tal como lo ve el personal del curso. */
export interface ExaminerSubmission extends SubmissionToGrade {
  /** La vuelta del alumno ya está certificada: su nota no se toca. */
  roundClosed: boolean;
}

/** Aviso de que, al certificarse un alumno, se retiraron del disco los archivos que entregó en el curso. */
export interface FilesRetired {
  courseGuid: string;
  userGuid: string;
}
