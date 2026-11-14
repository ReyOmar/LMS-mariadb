import { IsIn, IsString, MaxLength } from 'class-validator';
import { Omittable } from '../../common/validation/omittable';
import { PagedSearchDto } from '../../common/validation/paged-search.dto';

/** Qué parte de la cola se pide. Sin valor, la cola entera del curso. */
const QUEUE_STATUSES = ['pending', 'graded'] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

/** Por mejor nota del alumno en el curso, que es lo que cuentan las cifras del panel. */
const ATTEMPT_RESULTS = ['passed', 'failed'] as const;
export type AttemptResult = (typeof ATTEMPT_RESULTS)[number];

/** Lo común a las dos colas del examinador: un curso, una página y una búsqueda. */
class ExaminerQueue extends PagedSearchDto {
  /**
   * Curso que se está corrigiendo. Es obligatorio: sin él la consulta recorre la sede
   * entera y el examinador ya elige uno antes de ponerse a corregir.
   */
  @IsString()
  @MaxLength(191)
  course: string;
}

export class SubmissionQueueDto extends ExaminerQueue {
  @Omittable()
  @IsIn(QUEUE_STATUSES, { message: 'El filtro de estado no es válido.' })
  status?: QueueStatus;
}

export class AttemptQueueDto extends ExaminerQueue {
  @Omittable()
  @IsIn(ATTEMPT_RESULTS, { message: 'El filtro de resultado no es válido.' })
  result?: AttemptResult;
}
