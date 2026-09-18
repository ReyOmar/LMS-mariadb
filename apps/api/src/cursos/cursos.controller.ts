import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CursosService } from './cursos.service';
import { BloqueService } from './bloque.service';
import { QuizService } from './quiz.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import {
  AsignarCursoDto,
  CreateCursoDto,
  CreateModuloDto,
  ReordenarDto,
  UpdateCursoDto,
  UpdateModuloDto,
} from './dto/cursos.dto';
import { CreateBloqueDto, UpdateBloqueDto } from './dto/bloques.dto';
import { SubmitQuizDto } from './dto/submit-quiz.dto';

@Controller('cursos')
export class CursosController {
  constructor(
    private readonly cursos: CursosService,
    private readonly bloques: BloqueService,
    private readonly quiz: QuizService,
  ) {}

  // ── Listados ─────────────────────────────────────────────────────────────

  /** Cursos del usuario en sesión, según su rol. */
  @Get()
  getMisCursos(@CurrentUser() user: JwtPayload) {
    return this.cursos.getCursosDelUsuario(user);
  }

  /** Cursos de otro usuario de la sede. Sólo para el panel de administración. */
  @Roles('ADMINISTRADOR')
  @Get('/usuario/:usuario_guid')
  getCursosDeUsuario(@CurrentUser() user: JwtPayload, @Param('usuario_guid') usuarioGuid: string) {
    return this.cursos.getCursosDeUsuario(usuarioGuid, user.pais);
  }

  // ── Ficha ────────────────────────────────────────────────────────────────

  /**
   * Ficha para editar el curso: incluye la configuración completa de los cuestionarios,
   * con sus respuestas correctas.
   */
  @Roles('ADMINISTRADOR', 'PROFESOR')
  @Get('/:guid/gestion')
  getCursoParaGestion(@CurrentUser() user: JwtPayload, @Param('guid') guid: string) {
    return this.cursos.getCursoParaGestion(guid, user);
  }

  /**
   * Ficha para estudiar el curso. Exige matrícula y devuelve los cuestionarios sin las
   * respuestas correctas.
   */
  @Get('/:guid')
  getCurso(@CurrentUser() user: JwtPayload, @Param('guid') guid: string) {
    return user.role === 'ESTUDIANTE'
      ? this.cursos.getCursoParaEstudiante(guid, user)
      : this.cursos.getCursoParaGestion(guid, user);
  }

  // ── Ciclo de vida ────────────────────────────────────────────────────────

  @Roles('ADMINISTRADOR')
  @Post()
  createCurso(@CurrentUser() user: JwtPayload, @Body() dto: CreateCursoDto) {
    return this.cursos.createCurso(dto, user);
  }

  @Roles('ADMINISTRADOR', 'PROFESOR')
  @Patch('/:guid')
  updateCurso(@CurrentUser() user: JwtPayload, @Param('guid') guid: string, @Body() dto: UpdateCursoDto) {
    return this.cursos.updateCurso(guid, dto, user);
  }

  @Roles('ADMINISTRADOR')
  @Post('/:guid/asignar')
  asignarCurso(@CurrentUser() user: JwtPayload, @Param('guid') guid: string, @Body() dto: AsignarCursoDto) {
    return this.cursos.asignarProfesor(guid, dto.profesor_guid, user);
  }

  @Roles('ADMINISTRADOR')
  @Delete('/:guid')
  deleteCurso(@CurrentUser() user: JwtPayload, @Param('guid') guid: string) {
    return this.cursos.deleteCurso(guid, user);
  }

  // ── Módulos ──────────────────────────────────────────────────────────────

  @Roles('ADMINISTRADOR', 'PROFESOR')
  @Post('/:curso_guid/modulos')
  createModulo(
    @CurrentUser() user: JwtPayload,
    @Param('curso_guid') cursoGuid: string,
    @Body() dto: CreateModuloDto,
  ) {
    return this.bloques.crearModulo(cursoGuid, dto, user);
  }

  @Roles('ADMINISTRADOR', 'PROFESOR')
  @Patch('/:curso_guid/modulos/orden')
  reordenarModulos(
    @CurrentUser() user: JwtPayload,
    @Param('curso_guid') cursoGuid: string,
    @Body() dto: ReordenarDto,
  ) {
    return this.bloques.reordenarModulos(cursoGuid, dto.guids, user);
  }

  @Roles('ADMINISTRADOR', 'PROFESOR')
  @Patch('/modulos/:modulo_guid')
  updateModulo(
    @CurrentUser() user: JwtPayload,
    @Param('modulo_guid') moduloGuid: string,
    @Body() dto: UpdateModuloDto,
  ) {
    return this.bloques.actualizarModulo(moduloGuid, dto, user);
  }

  @Roles('ADMINISTRADOR', 'PROFESOR')
  @Delete('/modulos/:modulo_guid')
  deleteModulo(@CurrentUser() user: JwtPayload, @Param('modulo_guid') moduloGuid: string) {
    return this.bloques.eliminarModulo(moduloGuid, user);
  }

  // ── Bloques (recursos) ───────────────────────────────────────────────────

  @Roles('ADMINISTRADOR', 'PROFESOR')
  @Post('/modulos/:modulo_guid/bloques')
  createBloque(
    @CurrentUser() user: JwtPayload,
    @Param('modulo_guid') moduloGuid: string,
    @Body() dto: CreateBloqueDto,
  ) {
    return this.bloques.crearRecurso(moduloGuid, dto, user);
  }

  @Roles('ADMINISTRADOR', 'PROFESOR')
  @Patch('/modulos/:modulo_guid/bloques/orden')
  reordenarBloques(
    @CurrentUser() user: JwtPayload,
    @Param('modulo_guid') moduloGuid: string,
    @Body() dto: ReordenarDto,
  ) {
    return this.bloques.reordenarRecursos(moduloGuid, dto.guids, user);
  }

  @Roles('ADMINISTRADOR', 'PROFESOR')
  @Get('/bloques/:bloque_guid')
  getBloque(@CurrentUser() user: JwtPayload, @Param('bloque_guid') bloqueGuid: string) {
    return this.bloques.getRecurso(bloqueGuid, user);
  }

  @Roles('ADMINISTRADOR', 'PROFESOR')
  @Patch('/bloques/:bloque_guid')
  updateBloque(
    @CurrentUser() user: JwtPayload,
    @Param('bloque_guid') bloqueGuid: string,
    @Body() dto: UpdateBloqueDto,
  ) {
    return this.bloques.actualizarRecurso(bloqueGuid, dto, user);
  }

  @Roles('ADMINISTRADOR', 'PROFESOR')
  @Delete('/bloques/:bloque_guid')
  deleteBloque(@CurrentUser() user: JwtPayload, @Param('bloque_guid') bloqueGuid: string) {
    return this.bloques.eliminarRecurso(bloqueGuid, user);
  }

  // ── Cuestionarios ────────────────────────────────────────────────────────

  @Get('/quiz/:bloque_guid/estado')
  getEstadoQuiz(@CurrentUser() user: JwtPayload, @Param('bloque_guid') bloqueGuid: string) {
    return this.quiz.getEstado(bloqueGuid, user);
  }

  @Post('/quiz/:bloque_guid/iniciar')
  iniciarQuiz(@CurrentUser() user: JwtPayload, @Param('bloque_guid') bloqueGuid: string) {
    return this.quiz.iniciarIntento(bloqueGuid, user);
  }

  @Post('/quiz/:bloque_guid/enviar')
  enviarQuiz(
    @CurrentUser() user: JwtPayload,
    @Param('bloque_guid') bloqueGuid: string,
    @Body() dto: SubmitQuizDto,
  ) {
    return this.quiz.corregirIntento(bloqueGuid, user, dto.respuestas);
  }
}
