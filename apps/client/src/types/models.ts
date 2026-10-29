/**
 * Formas de los datos que devuelve la API.
 *
 * Es el espejo del esquema de Prisma y de las proyecciones de cada servicio, no una copia
 * literal de las tablas: lo que se declara aquí es lo que el navegador recibe realmente.
 * Dos diferencias importantes respecto a la base de datos:
 *
 *  - Los archivos reservados llegan como **URL firmada** (`fileUrl`, `attachmentUrl`),
 *    nunca como clave de almacenamiento suelta.
 *  - Los cuestionarios llegan **sin las respuestas correctas** salvo en el editor de cursos.
 */

import type { Country } from '@/lib/country';

// ── Enumeraciones ──────────────────────────────────────────────────────────

export type UserRole = 'ADMIN' | 'TEACHER' | 'STUDENT';
export type CourseStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type DifficultyLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
export type ResourceType = 'TEXT' | 'LINK' | 'ASSIGNMENT';
export type SubmissionStatus = 'DRAFT' | 'SUBMITTED' | 'GRADED' | 'IN_REVIEW';
export type AccessRequestStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';
export type NotificationType =
  | 'NEW_ASSESSMENT'
  | 'DEADLINE_SOON'
  | 'DEADLINE_URGENT'
  | 'ASSIGNMENT_GRADED'
  | 'COURSE_ANNOUNCEMENT'
  | 'GLOBAL_ANNOUNCEMENT'
  | 'COURSE_WELCOME'
  | 'BADGE_UNLOCKED'
  | 'MODULE_COMPLETED'
  | 'MODULE_RESET'
  | 'SUBMISSION_REVIEW'
  | 'SUBMISSION_REJECTED'
  | 'COURSE_REACTIVATED'
  | 'INACTIVITY_REMINDER'
  | 'NEW_MESSAGE'
  | 'ENROLLMENT_WAITING';

// ── Personas ───────────────────────────────────────────────────────────────

export interface User {
  guid: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  country: Country;
  createdAt: string;
  updatedAt?: string;
  lastAccessAt?: string | null;
  usesDefaultPassword?: boolean;
  photoUrl?: string | null;
  /** Cursos de los que es responsable. Impide borrar la cuenta sin traspasarlos antes. */
  taughtCourses?: number;
  enrollments?: number;
}

export interface AccessRequest {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  requestedRole: UserRole;
  country: Country;
  status: AccessRequestStatus;
  rejectionReason?: string | null;
  createdAt: string;
}

// ── Contenido ──────────────────────────────────────────────────────────────

export interface Course {
  guid: string;
  title: string;
  description?: string | null;
  shortDescription?: string | null;
  /** Clave de almacenamiento; es material público y se resuelve con `fileUrlFor`. */
  coverImage?: string | null;
  level: DifficultyLevel;
  status: CourseStatus;
  durationHours?: number | null;
  /** Nota mínima para aprobar, en la escala 0–100. */
  passingScore: number;
  strictOrder?: boolean;
  maxStudents?: number | null;
  teacherGuid: string;
  teacher?: Pick<User, 'guid' | 'firstName' | 'lastName' | 'role'>;
  modules?: CourseModule[];
  /** En los listados, que no traen el contenido: cuántos módulos tiene. */
  _count?: { modules: number };
  createdAt: string;
  updatedAt?: string;
  /** Sólo en el listado del alumno: cuándo se le asignó. */
  assignedAt?: string;
  /** Sólo en el listado del alumno: cuándo terminó la vuelta actual; nulo mientras está en curso. */
  completedAt?: string | null;
  /** Sólo en el listado del alumno: su avance en la vuelta actual. */
  completedResources?: number;
  totalResources?: number;
  percent?: number;
}

export interface CourseModule {
  guid: string;
  courseGuid: string;
  title: string;
  description?: string | null;
  position: number;
  resources?: Resource[];
}

export interface Resource {
  guid: string;
  moduleGuid: string;
  title: string;
  type: ResourceType;
  contentHtml?: string | null;
  referenceUrl?: string | null;
  position: number;
  maxUploadMb?: number | null;

  /** Clave de almacenamiento del adjunto. La usa el editor al guardar. */
  attachmentKey?: string | null;
  attachmentName?: string | null;
  /** URL firmada del adjunto, lista para usar en un enlace. */
  attachmentUrl?: string | null;
  fileUrl?: string | null;
  fileDownloadUrl?: string | null;

  /**
   * Configuración del cuestionario, serializada y con las respuestas correctas. Sólo en la
   * vista de gestión; en la del alumno es nula.
   */
  quizConfig?: string | null;
  /**
   * Sólo en la vista del alumno: el resumen del cuestionario. Las preguntas se piden al abrir
   * el intento y las respuestas correctas no salen del servidor.
   */
  quiz?: { allowedAttempts: number; timeLimitMinutes: number; questionCount: number } | null;
}

// ── Evaluación ─────────────────────────────────────────────────────────────

export interface Submission {
  guid: string;
  status: SubmissionStatus | 'PENDING';
  submittedAt?: string | null;
  attemptNumber?: number;
  /** Nombre original del archivo que subió el alumno. */
  fileName?: string | null;
  /** URL firmada de descarga; `null` si el archivo se purgó tras emitir el certificado. */
  fileUrl?: string | null;
  filePurged?: boolean;
  /** Nota en la escala 0–100. `null` mientras no se haya calificado. */
  score?: number | null;
  feedback?: string | null;
}

export interface SubmissionToGrade extends Submission {
  student: Pick<User, 'guid' | 'firstName' | 'lastName' | 'email'>;
  assignmentGuid: string | null;
  assignmentTitle: string;
  moduleGuid?: string | null;
  moduleTitle?: string | null;
  courseGuid: string | null;
  courseTitle: string | null;
  /** Umbral del curso al que pertenece la entrega. */
  passingScore: number;
}

/**
 * Preguntas de un cuestionario, en sus dos formas.
 *
 * La diferencia no es cosmética: `OptionWithAnswer` lleva cuál es la correcta y **sólo
 * puede llegar al editor de cursos**. Lo que recibe el alumno al hacer el examen es la
 * otra, sin `isCorrect`, y así está escrito también en el servidor
 * (`apps/api/src/courses/quiz-config.ts`). Tener los dos nombres separados hace que pedir
 * la forma equivocada en una pantalla de alumno sea un error de compilación.
 */
export interface QuizOption {
  id: string;
  text: string;
}

export interface OptionWithAnswer extends QuizOption {
  isCorrect: boolean;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: QuizOption[];
}

export interface QuestionWithAnswers {
  id: string;
  prompt: string;
  options: OptionWithAnswer[];
}

/** Lo que edita el examinador y se guarda serializado en el recurso. */
export interface QuizConfig {
  /** 0 = intentos ilimitados. */
  allowedAttempts: number;
  /** 0 = sin límite de tiempo. */
  timeLimitMinutes: number;
  questions: QuestionWithAnswers[];
}

export interface QuizState {
  attemptsMade: number;
  maxAttempts: number;
  bestScore: number | null;
  passingScore: number;
  passed: boolean;
  attemptInProgress: boolean;
  startedAt: string | null;
  timeLimitMinutes: number;
  canRetry: boolean;
  /** Explicación para el alumno cuando no puede empezar. */
  blockedReason: string | null;
}

// ── Progreso y certificación ───────────────────────────────────────────────

export interface CourseProgress {
  completed: string[];
  /** Recursos desbloqueados porque su calificación lleva demasiado tiempo pendiente. */
  unlockedByWait: string[];
  pendingAssignments: { resourceGuid: string; title: string; submittedAt: string | null }[];
  totalResources: number;
  percent: number;
  courseTitle?: string;
}

export interface Certificate {
  guid: string;
  /** Nulo si el curso se eliminó: el certificado sigue acreditando la formación. */
  courseGuid: string | null;
  courseTitle: string;
  courseImage?: string | null;
  /** Vuelta del alumno por el curso: 1 la primera vez, 2 si tuvo que repetirlo… */
  attempt: number;
  verificationCode: string;
  /** Cuándo se matriculó: la «fecha de inscripción» del diploma. */
  startedAt: string;
  completedAt: string;
  /** Hasta cuándo acredita. Nulo cuando la sede no declara vigencia. */
  validUntil: string | null;
  /** Si sigue en plazo. Un certificado vencido no deja de ser auténtico. */
  unexpired: boolean;
  /** Horas del programa, las que acredita el diploma. */
  hours: number;
  /** Lo que el alumno estuvo realmente dentro. No es lo que se acredita. */
  activeSeconds: number;
  averageScore: number | null;
}

// ── Paneles ────────────────────────────────────────────────────────────────

/** Actividad de un día en el panel de administración. */
export interface DailyActivity {
  day: string;
  submissions: number;
  resources: number;
}

/** Cuántos alumnos tiene cada curso publicado. */
export interface CourseBreakdown {
  guid: string;
  name: string;
  enrollments: number;
}

/** Resumen de la sede que alimenta el panel del administrador. */
export interface CountrySummary {
  users: { total: number; students: number; teachers: number; admins: number };
  courses: { published: number; draft: number; total: number };
  /** Solicitudes de acceso por revisar. */
  pendingRequests: number;
  totalEnrollments: number;
  /** Media de las notas calificadas, en la escala 0-100. `null` si aun no hay ninguna. */
  overallAverage: number | null;
  weeklyActivity: DailyActivity[];
  courseBreakdown: CourseBreakdown[];
}

/** Avance de un alumno en un módulo. Se pide al desplegar un curso en el monitoreo. */
export interface ModuleProgress {
  guid: string;
  title: string;
  total: number;
  completed: number;
  percent: number;
}

/** Avance de un alumno en uno de sus cursos, tal como llega en cada fila del monitoreo. */
export interface CourseProgressSummary {
  courseGuid: string;
  courseTitle: string;
  percent: number;
  completed: number;
  totalResources: number;
  completedModules: number;
  totalModules: number;
}

/** Una fila del monitoreo: un alumno con su avance en los cursos que gestiona quien mira. */
export interface MonitoredStudent {
  guid: string;
  firstName: string;
  lastName: string;
  email: string;
  lastAccessAt: string | null;
  totalSubmissions: number;
  /** Media de sus cursos, o el avance en el curso elegido en el filtro. */
  progress: number;
  courses: CourseProgressSummary[];
}

/** Cifras del monitoreo sobre todos los alumnos que casan con el filtro, no sólo una página. */
export interface MonitoringSummary {
  courses: { guid: string; title: string }[];
  students: number;
  withSubmissions: number;
  totalSubmissions: number;
  /** Alumnos por tramo de avance: 0–25, 26–50, 51–75 y 76–100. */
  ranges: number[];
  /** Alumnos por día de la semana de su último acceso, de domingo a sábado. */
  loginsPerDay: number[];
}

/** Avance acumulado del alumno en todos sus cursos. */
export interface StudentMetrics {
  totalCourses: number;
  completedCourses: number;
  completedResources: number;
  totalResources: number;
  percent: number;
  totalHoursSpent: number;
  overallAverage: number | null;
}

// ── Comunicación ───────────────────────────────────────────────────────────

/** Plantilla de un correo del sistema. */
export interface EmailTemplate {
  id: number;
  internalName: string;
  subject: string;
  bodyHtml: string;
  active: boolean;
}

/** Momento del sistema que dispara un correo, con las plantillas que puede usar. */
export interface EmailEvent {
  id: number;
  key: string;
  displayName: string;
  description: string;
  /** JSON con los nombres de variable admitidos en la plantilla. */
  variables: string;
  /** Sin él una cuenta no se puede usar (recuperar la contraseña, la temporal): no se desactiva. */
  essential: boolean;
  templates: EmailTemplate[];
}

export interface Notification {
  id: number;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  actionUrl?: string | null;
  createdAt: string;
}

export interface Contact {
  guid: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  photoUrl?: string | null;
  lastMessage: string;
  lastMessageAt: string | null;
  unreadCount: number;
  /** Si todavía se le puede escribir; si no, sólo queda el historial. */
  canWrite: boolean;
}

export interface Message {
  id: number;
  senderGuid: string;
  subject: string;
  content: string;
  read: boolean;
  createdAt: string;
  /** Lo calcula el servidor para no tener que comparar con el usuario en cada render. */
  isMine: boolean;
}

// ── Integración con otros sistemas ─────────────────────────────────────────

/** Un sistema externo conectado a la sede, como el del PESV. Su clave sólo se ve al generarla. */
export interface IntegrationClient {
  id: number;
  name: string;
  /** Comienzo de la clave vigente; nulo si se revocó. */
  keyPrefix: string | null;
  keyIssuedAt: string | null;
  lastUsedAt: string | null;
  /** Dirección a la que se le avisa de los cambios en sus solicitudes; nula si consulta él. */
  callbackUrl: string | null;
  /** El último intento de aviso y, si falló, por qué. */
  lastNoticeAt: string | null;
  noticeError: string | null;
  createdAt: string;
  _count: { requests: number };
}

/** Lo que contesta el aviso de prueba a la dirección de un sistema. */
export interface CallbackTest {
  delivered: boolean;
  message: string;
}

export interface IssuedIntegrationKey {
  client: IntegrationClient;
  key: string;
}

/** Por qué espera una matrícula pedida por otro sistema. */
export type WaitingReason = 'COURSE_NOT_ASSIGNED' | 'COURSE_NOT_PUBLISHED' | 'COURSE_FULL';

export interface WaitingRequest {
  guid: string;
  externalId: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: string;
  /** El sistema que la pidió. */
  system: string;
}

/** Una infracción que llegó desde otro sistema, el curso que la atiende y quién espera por ella. */
export interface Infraction {
  id: number;
  code: string;
  description: string | null;
  course: Pick<Course, 'guid' | 'title' | 'status'> | null;
  /** Si el curso lo eligió el campus por su título y no un administrador. */
  autoAssigned: boolean;
  /** Por qué espera quien espera; nulo si no espera nadie o si el curso ya los admite. */
  reason: WaitingReason | null;
  waiting: WaitingRequest[];
}
