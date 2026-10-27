import type { EventEmitter2 } from '@nestjs/event-emitter';
import { Country } from './country';

/**
 * Eventos de dominio: qué ocurre en el campus y con qué datos.
 *
 * Quien los emite —los servicios— y quien los escucha —`EventsListener`— comparten estas
 * formas, de modo que renombrar un campo en un lado no deja al otro leyendo `undefined`.
 */

/** Datos comunes a todos los eventos: quién y en qué sede. */
export interface BaseEvent {
  userGuid: string;
  country: Country;
}

export interface QuizPassed extends BaseEvent {
  resourceGuid: string;
  courseGuid: string;
  score: number;
  quizTitle: string;
}

export interface QuizFailed extends BaseEvent {
  resourceGuid: string;
  courseGuid: string;
  courseTitle: string;
  teacherGuid: string;
  score: number;
  passingScore: number;
  quizTitle: string;
}

export interface AttemptEnabled extends BaseEvent {
  resourceGuid: string;
  courseGuid: string;
  quizTitle: string;
}

export interface SubmissionReceived extends BaseEvent {
  submissionGuid: string;
  assignmentTitle: string;
  courseTitle: string;
  teacherGuid: string;
  isResubmission: boolean;
  previousScore: number | null;
}

export interface SubmissionGraded extends BaseEvent {
  submissionGuid: string;
  assignmentGuid: string | null;
  courseGuid: string;
  assignmentTitle: string;
  score: number;
  passingScore: number;
  passed: boolean;
  feedback: string | null;
}

export interface ProgressUpdated extends BaseEvent {
  courseGuid: string;
}

/**
 * Un curso publicado puede admitir ahora a quien lo esperaba desde otro sistema: se acaba de
 * publicar, le pusieron código de integración o cambió su cupo.
 */
export interface CourseOpened extends BaseEvent {
  courseGuid: string;
}

/** Cada evento con sus datos. Es la lista completa de lo que el campus anuncia. */
export interface DomainEvents {
  'quiz.passed': QuizPassed;
  'quiz.failed': QuizFailed;
  'quiz.attempt_enabled': AttemptEnabled;
  'submission.received': SubmissionReceived;
  'submission.graded': SubmissionGraded;
  'progress.updated': ProgressUpdated;
  'course.opened': CourseOpened;
}

/** Emite un evento de dominio; el compilador comprueba el nombre y los datos. */
export function emitEvent<E extends keyof DomainEvents>(emitter: EventEmitter2, event: E, data: DomainEvents[E]): void {
  emitter.emit(event, data);
}
