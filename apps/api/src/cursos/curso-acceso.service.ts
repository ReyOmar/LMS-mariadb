import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Pais } from '../common/domain/pais';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

/** Datos mínimos de un curso para decidir si alguien puede verlo o tocarlo. */
export interface CursoParaAcceso {
  guid: string;
  pais: Pais;
  titulo: string;
  estado: 'BORRADOR' | 'PUBLICADO' | 'ARCHIVADO';
  profesor_guid: string;
  nota_aprobacion: unknown;
}

/**
 * Reglas de acceso a un curso, en un solo sitio.
 *
 * Antes cada módulo repetía su propia versión de «¿es mío este curso?» y varios
 * sencillamente no la hacían: se podía leer cualquier curso por su GUID, calificar la
 * entrega de otro profesor o consultar el progreso de alumnos ajenos. Aquí quedan las
 * cuatro preguntas que se repiten en todo el sistema:
 *
 *  1. ¿El curso es de mi sede?
 *  2. ¿Lo gestiono yo?
 *  3. ¿Estoy matriculado en él?
 *  4. ¿A qué curso pertenece este recurso o esta entrega?
 *
 * Todas responden «no encontrado» en lugar de «no autorizado» cuando el recurso es de otra
 * sede: para un usuario de Colombia, los cursos de México no existen.
 */
@Injectable()
export class CursoAccesoService {
  constructor(private readonly prisma: PrismaService) {}

  /** Curso de la sede indicada. */
  async cursoDeSede(cursoGuid: string, pais: Pais): Promise<CursoParaAcceso> {
    const curso = await this.prisma.lms_cursos.findFirst({
      where: { guid: cursoGuid, pais },
      select: { guid: true, pais: true, titulo: true, estado: true, profesor_guid: true, nota_aprobacion: true },
    });
    if (!curso) throw new NotFoundException('Curso no encontrado.');
    return curso;
  }

  /**
   * Curso que el usuario puede administrar.
   * Un administrador gestiona todos los de su sede; un profesor sólo los asignados a él.
   */
  async cursoQueGestiona(cursoGuid: string, user: JwtPayload): Promise<CursoParaAcceso> {
    const curso = await this.cursoDeSede(cursoGuid, user.pais);
    if (user.role === 'PROFESOR' && curso.profesor_guid !== user.sub) {
      throw new ForbiddenException('Sólo puedes trabajar sobre los cursos asignados a ti.');
    }
    return curso;
  }

  /**
   * Curso que el usuario puede administrar **y** que admite cambios de contenido.
   *
   * Un curso publicado no se edita: hay alumnos avanzando por él y cambiar los recursos
   * bajo sus pies invalidaría su progreso. Hay que pasarlo a borrador primero.
   */
  async cursoEditable(cursoGuid: string, user: JwtPayload): Promise<CursoParaAcceso> {
    const curso = await this.cursoQueGestiona(cursoGuid, user);
    if (curso.estado !== 'BORRADOR') {
      throw new BadRequestException(
        'El curso debe estar en Borrador para modificar su contenido. Pásalo a Borrador desde la ficha del curso.',
      );
    }
    return curso;
  }

  /** Curso al que pertenece un módulo. */
  async cursoDeModulo(moduloGuid: string, pais: Pais): Promise<CursoParaAcceso> {
    const modulo = await this.prisma.lms_modulos.findUnique({
      where: { guid: moduloGuid },
      select: { curso_guid: true },
    });
    if (!modulo) throw new NotFoundException('Módulo no encontrado.');
    return this.cursoDeSede(modulo.curso_guid, pais);
  }

  /** Curso al que pertenece un recurso. */
  async cursoDeRecurso(recursoGuid: string, pais: Pais): Promise<CursoParaAcceso> {
    const recurso = await this.prisma.lms_recursos.findUnique({
      where: { guid: recursoGuid },
      select: { modulo: { select: { curso_guid: true } } },
    });
    if (!recurso) throw new NotFoundException('Recurso no encontrado.');
    return this.cursoDeSede(recurso.modulo.curso_guid, pais);
  }

  /**
   * Comprueba que el usuario está matriculado en el curso.
   * @throws ForbiddenException con un mensaje que el alumno entiende, en lugar de un 404
   *         que le haría pensar que el curso no existe.
   */
  async asegurarMatricula(cursoGuid: string, usuarioGuid: string): Promise<void> {
    const matricula = await this.prisma.lms_matriculas.findUnique({
      where: { usuario_guid_curso_guid: { usuario_guid: usuarioGuid, curso_guid: cursoGuid } },
      select: { activa: true },
    });
    if (!matricula) {
      throw new ForbiddenException('No estás matriculado en este curso.');
    }
    if (!matricula.activa) {
      throw new ForbiddenException('Tu matrícula en este curso está dada de baja. Contacta con el administrador.');
    }
  }

  /**
   * Acceso de un alumno al contenido de un recurso: el curso debe ser de su sede, estar
   * publicado y tenerlo matriculado.
   */
  async asegurarAccesoARecurso(recursoGuid: string, user: JwtPayload): Promise<CursoParaAcceso> {
    const curso = await this.cursoDeRecurso(recursoGuid, user.pais);

    if (user.role === 'ESTUDIANTE') {
      await this.asegurarMatricula(curso.guid, user.sub);
      if (curso.estado !== 'PUBLICADO') {
        throw new ForbiddenException('Este curso está en mantenimiento. Podrás continuar cuando vuelva a publicarse.');
      }
      return curso;
    }

    if (user.role === 'PROFESOR' && curso.profesor_guid !== user.sub) {
      throw new ForbiddenException('Sólo puedes consultar los cursos asignados a ti.');
    }
    return curso;
  }

  /**
   * Curso al que pertenece una entrega, comprobando que quien la va a calificar es su
   * responsable. Cierra el caso en que un profesor calificaba entregas de otro sabiendo
   * sólo el identificador.
   */
  async cursoDeEntregaQueGestiona(entregaGuid: string, user: JwtPayload) {
    const entrega = await this.prisma.lms_entregas.findUnique({
      where: { guid: entregaGuid },
      select: {
        guid: true,
        usuario_guid: true,
        tarea_guid: true,
        estado: true,
        calificacion: true,
        tarea: { select: { titulo: true, modulo: { select: { curso_guid: true } } } },
      },
    });
    if (!entrega?.tarea) throw new NotFoundException('Entrega no encontrada.');

    const curso = await this.cursoQueGestiona(entrega.tarea.modulo.curso_guid, user);
    return { entrega, curso };
  }

  /** GUID de todos los recursos de un curso, en orden de recorrido. */
  async recursosDelCurso(cursoGuid: string): Promise<{ guid: string; tipo: string; titulo: string }[]> {
    return this.prisma.lms_recursos.findMany({
      where: { modulo: { curso_guid: cursoGuid } },
      select: { guid: true, tipo: true, titulo: true },
      orderBy: [{ modulo: { orden: 'asc' } }, { orden: 'asc' }],
    });
  }
}
