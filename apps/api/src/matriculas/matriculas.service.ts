import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { MailService } from '../mail/mail.service';
import { CursoAccesoService } from '../cursos/curso-acceso.service';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

/**
 * Matrículas de alumnos en cursos.
 *
 * La invariante que se defiende aquí es que **alumno y curso pertenecen a la misma sede**.
 * Es el único punto del sistema donde podrían cruzarse los datos de Colombia y México, ya
 * que todo lo demás (progreso, entregas, certificados) cuelga de una matrícula.
 */
@Injectable()
export class MatriculasService {
  private readonly logger = new Logger(MatriculasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly acceso: CursoAccesoService,
    private readonly realtime: RealtimeService,
    private readonly mail: MailService,
  ) {}

  /** Alumnos matriculados en un curso. */
  async getMatriculados(cursoGuid: string, user: JwtPayload) {
    await this.acceso.cursoQueGestiona(cursoGuid, user);

    const matriculas = await this.prisma.lms_matriculas.findMany({
      where: { curso_guid: cursoGuid },
      select: {
        activa: true,
        fecha_matricula: true,
        usuario: { select: { guid: true, nombre: true, apellido: true, email: true, ultimo_acceso: true } },
      },
      orderBy: { fecha_matricula: 'desc' },
    });

    return matriculas.map((m) => ({ ...m.usuario, activa: m.activa, fecha_matricula: m.fecha_matricula }));
  }

  /** Alumnos de la sede que todavía no están en el curso. */
  async getCandidatos(cursoGuid: string, user: JwtPayload) {
    await this.acceso.cursoQueGestiona(cursoGuid, user);

    return this.prisma.usuarios.findMany({
      where: {
        pais: user.pais,
        rol: 'ESTUDIANTE',
        activo: true,
        matriculas: { none: { curso_guid: cursoGuid } },
      },
      select: { guid: true, nombre: true, apellido: true, email: true },
      orderBy: [{ nombre: 'asc' }, { apellido: 'asc' }],
    });
  }

  /**
   * Matricula a un alumno.
   * Comprueba la sede del alumno, su rol y el cupo del curso antes de crear la matrícula.
   */
  async matricular(cursoGuid: string, alumnoGuid: string, user: JwtPayload) {
    const curso = await this.acceso.cursoQueGestiona(cursoGuid, user);

    const alumno = await this.prisma.usuarios.findFirst({
      where: { guid: alumnoGuid, pais: user.pais, rol: 'ESTUDIANTE', activo: true },
      select: { guid: true, email: true, nombre: true },
    });
    if (!alumno) {
      throw new BadRequestException('El alumno debe ser un estudiante activo de tu misma sede.');
    }

    const yaMatriculado = await this.prisma.lms_matriculas.findUnique({
      where: { usuario_guid_curso_guid: { usuario_guid: alumnoGuid, curso_guid: cursoGuid } },
      select: { id: true, activa: true },
    });
    if (yaMatriculado?.activa) {
      throw new ConflictException('Este alumno ya está matriculado en el curso.');
    }

    await this.comprobarCupo(cursoGuid);

    const matricula = yaMatriculado
      ? await this.prisma.lms_matriculas.update({
          where: { id: yaMatriculado.id },
          data: { activa: true, fecha_baja: null, fecha_matricula: new Date() },
        })
      : await this.prisma.lms_matriculas.create({
          data: { usuario_guid: alumnoGuid, curso_guid: cursoGuid, tipo: 'MANUAL' },
        });

    this.realtime.emitirAUsuarios(
      'enrollment:changed',
      { accion: 'matriculado', curso_guid: cursoGuid, curso_titulo: curso.titulo },
      user.pais,
      [alumnoGuid],
    );
    this.realtime.emitirARol('dashboard:refresh', { motivo: 'matricula' }, user.pais, 'ADMINISTRADOR');

    void this.mail
      .sendEnrollmentNotification(alumno.email, alumno.nombre, curso.titulo, cursoGuid, user.pais)
      .catch((error) => this.logger.error('No se pudo avisar de la matrícula', error));

    return matricula;
  }

  /**
   * Da de baja a un alumno conservando su historial.
   *
   * No se borra la fila: el progreso, las entregas y los certificados cuelgan de ella y
   * eliminarla destruiría el registro documental de una capacitación ya realizada.
   */
  async darDeBaja(cursoGuid: string, alumnoGuid: string, user: JwtPayload) {
    await this.acceso.cursoQueGestiona(cursoGuid, user);

    const matricula = await this.prisma.lms_matriculas.findUnique({
      where: { usuario_guid_curso_guid: { usuario_guid: alumnoGuid, curso_guid: cursoGuid } },
      select: { id: true, activa: true },
    });
    if (!matricula) throw new NotFoundException('Este alumno no está matriculado en el curso.');
    if (!matricula.activa) throw new BadRequestException('Esta matrícula ya está dada de baja.');

    await this.prisma.lms_matriculas.update({
      where: { id: matricula.id },
      data: { activa: false, fecha_baja: new Date() },
    });

    this.realtime.emitirAUsuarios('enrollment:changed', { accion: 'baja', curso_guid: cursoGuid }, user.pais, [
      alumnoGuid,
    ]);
    this.realtime.emitirARol('dashboard:refresh', { motivo: 'matricula' }, user.pais, 'ADMINISTRADOR');

    return { message: 'Matrícula dada de baja. El historial del alumno se conserva.' };
  }

  /** Impide superar el cupo declarado del curso. */
  private async comprobarCupo(cursoGuid: string): Promise<void> {
    const curso = await this.prisma.lms_cursos.findUnique({
      where: { guid: cursoGuid },
      select: { max_estudiantes: true },
    });
    if (!curso?.max_estudiantes) return;

    const matriculados = await this.prisma.lms_matriculas.count({ where: { curso_guid: cursoGuid, activa: true } });
    if (matriculados >= curso.max_estudiantes) {
      throw new BadRequestException(
        `El curso ha alcanzado su cupo máximo de ${curso.max_estudiantes} estudiantes. Amplíalo desde la ficha del curso para poder matricular a más.`,
      );
    }
  }
}
