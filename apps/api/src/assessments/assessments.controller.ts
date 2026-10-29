import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';
import { SubmissionsService } from './submissions.service';
import { ExaminerPanelsService } from './examiner-panels.service';
import { GradingService } from './grading.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { receiveFile } from '../storage/multipart';
import { GradeSubmissionDto } from './dto/grade-submission.dto';
import { SubmissionQueueDto, AttemptQueueDto } from './dto/examiner-queue.dto';

@Controller('assessments')
export class AssessmentsController {
  constructor(
    private readonly submissions: SubmissionsService,
    private readonly panels: ExaminerPanelsService,
    private readonly grading: GradingService,
  ) {}

  // ── Alumno ───────────────────────────────────────────────────────────────

  /**
   * El archivo se lee después de comprobar la matrícula y con el límite exacto de la tarea:
   * lo que lo supere se descarta al llegar en lugar de escribirse entero en disco.
   */
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('/assignments/:assignmentGuid/submissions')
  sendSubmission(
    @CurrentUser() user: JwtPayload,
    @Param('assignmentGuid') assignmentGuid: string,
    @Req() req: FastifyRequest,
  ) {
    return this.submissions.recordSubmission(assignmentGuid, (limit) => receiveFile(req, limit), user);
  }

  @Get('/assignments/:assignmentGuid/submissions/mine')
  getMySubmission(@CurrentUser() user: JwtPayload, @Param('assignmentGuid') assignmentGuid: string) {
    return this.submissions.getMySubmission(assignmentGuid, user);
  }

  // ── Examinador ───────────────────────────────────────────────────────────

  /** Una página de la cola de corrección del curso elegido. */
  @Roles('ADMIN', 'TEACHER')
  @Get('/examiner/submissions')
  getSubmissionsToGrade(@CurrentUser() user: JwtPayload, @Query() filter: SubmissionQueueDto) {
    return this.panels.getSubmissionsToGrade(user, filter);
  }

  /** Cifras de las tareas por curso. Van aparte de la lista porque describen el curso entero, no la página. */
  @Roles('ADMIN', 'TEACHER')
  @Get('/examiner/submissions/summary')
  summarizeSubmissions(@CurrentUser() user: JwtPayload) {
    return this.panels.summarizeSubmissions(user);
  }

  /** Resultados de los cuestionarios, que se corrigen automáticamente, por alumno. */
  @Roles('ADMIN', 'TEACHER')
  @Get('/examiner/quizzes')
  getQuizAttempts(@CurrentUser() user: JwtPayload, @Query() filter: AttemptQueueDto) {
    return this.panels.getQuizAttempts(user, filter);
  }

  /** Cifras de los cuestionarios por curso, calculadas sobre la mejor nota de cada alumno. */
  @Roles('ADMIN', 'TEACHER')
  @Get('/examiner/quizzes/summary')
  summarizeQuizzes(@CurrentUser() user: JwtPayload) {
    return this.panels.summarizeQuizzes(user);
  }

  @Roles('ADMIN', 'TEACHER')
  @Patch('/submissions/:guid/grade')
  gradeSubmission(@CurrentUser() user: JwtPayload, @Param('guid') guid: string, @Body() dto: GradeSubmissionDto) {
    return this.grading.gradeSubmission(guid, dto, user);
  }

  /** Concede un intento adicional a un alumno que agotó los del cuestionario. */
  @Roles('ADMIN', 'TEACHER')
  @Post('/quiz/:resourceGuid/students/:studentGuid/new-attempt')
  enableNewAttempt(
    @CurrentUser() user: JwtPayload,
    @Param('resourceGuid') resourceGuid: string,
    @Param('studentGuid') studentGuid: string,
  ) {
    return this.grading.enableNewAttempt(resourceGuid, studentGuid, user);
  }
}
