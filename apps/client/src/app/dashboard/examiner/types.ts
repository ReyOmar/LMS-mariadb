import type { SubmissionToGrade } from '@/types/models';

/** Entrega o intento tal como lo ve el personal del curso. */
export interface ExaminerSubmission extends SubmissionToGrade {
  /** La vuelta del alumno ya está certificada: su nota no se toca. */
  roundClosed: boolean;
}

/** Intento de cuestionario, con los intentos que admite su cuestionario. */
export interface QuizAttempt extends ExaminerSubmission {
  /** 0 son ilimitados; `null` si su configuración no se puede leer, y entonces no se habilita otro. */
  allowedAttempts: number | null;
}
