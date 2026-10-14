import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { CourseContentService } from './course-content.service';
import { QuizService } from './quiz.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import {
  AssignCourseDto,
  CreateCourseDto,
  CreateModuleDto,
  ReorderDto,
  UpdateCourseDto,
  UpdateModuleDto,
} from './dto/courses.dto';
import { CreateResourceDto, UpdateResourceDto } from './dto/resources.dto';
import { SubmitQuizDto } from './dto/submit-quiz.dto';

@Controller('courses')
export class CoursesController {
  constructor(
    private readonly courses: CoursesService,
    private readonly content: CourseContentService,
    private readonly quiz: QuizService,
  ) {}

  // ── Listados ─────────────────────────────────────────────────────────────

  /** Cursos del usuario en sesión, según su rol. */
  @Get()
  getMyCourses(@CurrentUser() user: JwtPayload) {
    return this.courses.getCurrentUserCourses(user);
  }

  /** Cursos de otro usuario de la sede. Sólo para el panel de administración. */
  @Roles('ADMIN')
  @Get('/user/:userGuid')
  getUserCourses(@CurrentUser() user: JwtPayload, @Param('userGuid') userGuid: string) {
    return this.courses.getUserCourses(userGuid, user.country);
  }

  // ── Ficha ────────────────────────────────────────────────────────────────

  /**
   * Ficha para editar el curso: incluye la configuración completa de los cuestionarios,
   * con sus respuestas correctas.
   */
  @Roles('ADMIN', 'TEACHER')
  @Get('/:guid/manage')
  getCourseForManagement(@CurrentUser() user: JwtPayload, @Param('guid') guid: string) {
    return this.courses.getCourseForManagement(guid, user);
  }

  /**
   * Ficha para estudiar el curso. Exige matrícula y devuelve los cuestionarios sin las
   * respuestas correctas.
   */
  @Get('/:guid')
  getCourse(@CurrentUser() user: JwtPayload, @Param('guid') guid: string) {
    return user.role === 'STUDENT'
      ? this.courses.getCourseForStudent(guid, user)
      : this.courses.getCourseForManagement(guid, user);
  }

  // ── Ciclo de vida ────────────────────────────────────────────────────────

  @Roles('ADMIN')
  @Post()
  createCourse(@CurrentUser() user: JwtPayload, @Body() dto: CreateCourseDto) {
    return this.courses.createCourse(dto, user);
  }

  @Roles('ADMIN', 'TEACHER')
  @Patch('/:guid')
  updateCourse(@CurrentUser() user: JwtPayload, @Param('guid') guid: string, @Body() dto: UpdateCourseDto) {
    return this.courses.updateCourse(guid, dto, user);
  }

  @Roles('ADMIN')
  @Post('/:guid/assign')
  assignCourse(@CurrentUser() user: JwtPayload, @Param('guid') guid: string, @Body() dto: AssignCourseDto) {
    return this.courses.assignTeacher(guid, dto.teacherGuid, user);
  }

  @Roles('ADMIN')
  @Delete('/:guid')
  deleteCourse(@CurrentUser() user: JwtPayload, @Param('guid') guid: string) {
    return this.courses.deleteCourse(guid, user);
  }

  // ── Módulos ──────────────────────────────────────────────────────────────

  @Roles('ADMIN', 'TEACHER')
  @Post('/:courseGuid/modules')
  createModule(@CurrentUser() user: JwtPayload, @Param('courseGuid') courseGuid: string, @Body() dto: CreateModuleDto) {
    return this.content.createModule(courseGuid, dto, user);
  }

  @Roles('ADMIN', 'TEACHER')
  @Patch('/:courseGuid/modules/order')
  reorderModules(@CurrentUser() user: JwtPayload, @Param('courseGuid') courseGuid: string, @Body() dto: ReorderDto) {
    return this.content.reorderModules(courseGuid, dto.guids, user);
  }

  @Roles('ADMIN', 'TEACHER')
  @Patch('/modules/:moduleGuid')
  updateModule(@CurrentUser() user: JwtPayload, @Param('moduleGuid') moduleGuid: string, @Body() dto: UpdateModuleDto) {
    return this.content.updateModule(moduleGuid, dto, user);
  }

  @Roles('ADMIN', 'TEACHER')
  @Delete('/modules/:moduleGuid')
  deleteModule(@CurrentUser() user: JwtPayload, @Param('moduleGuid') moduleGuid: string) {
    return this.content.deleteModule(moduleGuid, user);
  }

  // ── Bloques (recursos) ───────────────────────────────────────────────────

  @Roles('ADMIN', 'TEACHER')
  @Post('/modules/:moduleGuid/resources')
  createResource(
    @CurrentUser() user: JwtPayload,
    @Param('moduleGuid') moduleGuid: string,
    @Body() dto: CreateResourceDto,
  ) {
    return this.content.createResource(moduleGuid, dto, user);
  }

  @Roles('ADMIN', 'TEACHER')
  @Patch('/modules/:moduleGuid/resources/order')
  reorderResources(@CurrentUser() user: JwtPayload, @Param('moduleGuid') moduleGuid: string, @Body() dto: ReorderDto) {
    return this.content.reorderResources(moduleGuid, dto.guids, user);
  }

  @Roles('ADMIN', 'TEACHER')
  @Patch('/resources/:resourceGuid')
  updateResource(
    @CurrentUser() user: JwtPayload,
    @Param('resourceGuid') resourceGuid: string,
    @Body() dto: UpdateResourceDto,
  ) {
    return this.content.updateResource(resourceGuid, dto, user);
  }

  @Roles('ADMIN', 'TEACHER')
  @Delete('/resources/:resourceGuid')
  deleteResource(@CurrentUser() user: JwtPayload, @Param('resourceGuid') resourceGuid: string) {
    return this.content.deleteResource(resourceGuid, user);
  }

  // ── Cuestionarios ────────────────────────────────────────────────────────

  @Get('/quiz/:resourceGuid/status')
  getQuizStatus(@CurrentUser() user: JwtPayload, @Param('resourceGuid') resourceGuid: string) {
    return this.quiz.getStatus(resourceGuid, user);
  }

  @Post('/quiz/:resourceGuid/start')
  startQuiz(@CurrentUser() user: JwtPayload, @Param('resourceGuid') resourceGuid: string) {
    return this.quiz.startAttempt(resourceGuid, user);
  }

  @Post('/quiz/:resourceGuid/submit')
  submitQuiz(@CurrentUser() user: JwtPayload, @Param('resourceGuid') resourceGuid: string, @Body() dto: SubmitQuizDto) {
    return this.quiz.gradeAttempt(resourceGuid, user, dto.answers);
  }
}
