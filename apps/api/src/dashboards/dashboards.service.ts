import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CursoAccesoService } from '../cursos/curso-acceso.service';
import { promedioNotas } from '../common/domain/calificacion';
import { Pais } from '../common/domain/pais';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

/** Días que abarca la gráfica de actividad reciente. */
const DIAS_ACTIVIDAD = 7;

/** Cursos que se muestran en el reparto de matrículas. */
const CURSOS_EN_REPARTO = 10;

const NOMBRES_DIA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/**
 * Cuadros de mando.
 *
 * Los recuentos se piden a la base de datos con agregados en lugar de traerse las tablas
 * enteras y filtrarlas en Node, que es lo que hacía la versión anterior: cargaba todas las
 * matrículas y todas las entregas calificadas de la instalación en cada visita al panel.
 */
@Injectable()
export class DashboardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acceso: CursoAccesoService,
  ) {}

  // ── Panel de administración ──────────────────────────────────────────────

  /** Resumen de la sede: personas, cursos, promedio y actividad reciente. */
  async getResumenSede(pais: Pais) {
    const desde = this.inicioDelPeriodo();

    const [
      estudiantes,
      profesores,
      administradores,
      cursosPublicados,
      cursosBorrador,
      totalMatriculas,
      notas,
      actividad,
      reparto,
    ] = await Promise.all([
      this.prisma.usuarios.count({ where: { pais, rol: 'ESTUDIANTE', activo: true } }),
      this.prisma.usuarios.count({ where: { pais, rol: 'PROFESOR', activo: true } }),
      this.prisma.usuarios.count({ where: { pais, rol: 'ADMINISTRADOR', activo: true } }),
      this.prisma.lms_cursos.count({ where: { pais, estado: 'PUBLICADO' } }),
      this.prisma.lms_cursos.count({ where: { pais, estado: 'BORRADOR' } }),
      this.prisma.lms_matriculas.count({ where: { activa: true, curso: { pais } } }),
      this.prisma.lms_entregas.findMany({
        where: { estado: 'CALIFICADA', calificacion: { not: null }, usuario: { pais } },
        select: { calificacion: true },
        take: 5000,
      }),
      this.actividadReciente(pais, desde),
      this.repartoDeMatriculas(pais),
    ]);

    return {
      usuarios: {
        total: estudiantes + profesores + administradores,
        estudiantes,
        profesores,
        administradores,
      },
      cursos: {
        publicados: cursosPublicados,
        borrador: cursosBorrador,
        total: cursosPublicados + cursosBorrador,
      },
      totalMatriculas,
      promedioGlobal: promedioNotas(notas.map((n) => n.calificacion)),
      actividadSemanal: actividad,
      repartoCursos: reparto,
      generado: new Date().toISOString(),
    };
  }

  /** Entregas y recursos completados por día durante la última semana. */
  private async actividadReciente(pais: Pais, desde: Date) {
    const [entregas, progreso] = await Promise.all([
      this.prisma.lms_entregas.findMany({
        where: { fecha_entrega: { gte: desde }, usuario: { pais } },
        select: { fecha_entrega: true },
      }),
      this.prisma.lms_progreso_recurso.findMany({
        where: { fecha_completado: { gte: desde }, usuario: { pais } },
        select: { fecha_completado: true },
      }),
    ]);

    const porDia = new Map<string, { dia: string; entregas: number; recursos: number }>();
    for (let i = DIAS_ACTIVIDAD - 1; i >= 0; i--) {
      const fecha = new Date();
      fecha.setDate(fecha.getDate() - i);
      porDia.set(this.claveDeDia(fecha), {
        dia: NOMBRES_DIA[fecha.getDay()],
        entregas: 0,
        recursos: 0,
      });
    }

    for (const entrega of entregas) {
      if (!entrega.fecha_entrega) continue;
      const dia = porDia.get(this.claveDeDia(entrega.fecha_entrega));
      if (dia) dia.entregas++;
    }
    for (const paso of progreso) {
      const dia = porDia.get(this.claveDeDia(paso.fecha_completado));
      if (dia) dia.recursos++;
    }

    return [...porDia.values()];
  }

  /** Cursos con más matrículas de la sede. */
  private async repartoDeMatriculas(pais: Pais) {
    const cursos = await this.prisma.lms_cursos.findMany({
      where: { pais, estado: 'PUBLICADO' },
      select: { guid: true, titulo: true, _count: { select: { matriculas: true } } },
      orderBy: { matriculas: { _count: 'desc' } },
      take: CURSOS_EN_REPARTO,
    });

    return cursos.map((curso) => ({
      guid: curso.guid,
      nombre: curso.titulo,
      matriculas: curso._count.matriculas,
    }));
  }

  private inicioDelPeriodo(): Date {
    const desde = new Date();
    desde.setDate(desde.getDate() - (DIAS_ACTIVIDAD - 1));
    desde.setHours(0, 0, 0, 0);
    return desde;
  }

  private claveDeDia(fecha: Date): string {
    return `${fecha.getFullYear()}-${fecha.getMonth()}-${fecha.getDate()}`;
  }

  // ── Panel del examinador ─────────────────────────────────────────────────

  /**
   * Avance de los alumnos en los cursos que gestiona el usuario.
   *
   * El profesor sólo ve los suyos; el administrador, los de toda su sede. Antes el
   * identificador del profesor llegaba por query, así que bastaba con cambiarlo para ver
   * los alumnos de cualquier otro examinador.
   */
  async getMonitoreo(user: JwtPayload) {
    const cursos = await this.prisma.lms_cursos.findMany({
      where: {
        pais: user.pais,
        ...(user.role === 'PROFESOR' ? { profesor_guid: user.sub } : {}),
      },
      select: {
        guid: true,
        titulo: true,
        _count: { select: { modulos: true } },
        modulos: { select: { guid: true, titulo: true, _count: { select: { recursos: true } } } },
      },
    });
    if (cursos.length === 0) return [];

    const cursoGuids = cursos.map((c) => c.guid);

    const [matriculas, progreso, entregas] = await Promise.all([
      this.prisma.lms_matriculas.findMany({
        where: { curso_guid: { in: cursoGuids }, activa: true },
        select: {
          curso_guid: true,
          usuario: { select: { guid: true, nombre: true, apellido: true, email: true, ultimo_acceso: true } },
        },
      }),
      this.prisma.lms_progreso_recurso.findMany({
        where: { recurso: { modulo: { curso_guid: { in: cursoGuids } } } },
        select: { usuario_guid: true, recurso: { select: { modulo_guid: true } } },
      }),
      this.prisma.lms_entregas.groupBy({
        by: ['usuario_guid'],
        where: { tarea: { modulo: { curso_guid: { in: cursoGuids } } } },
        _count: { guid: true },
      }),
    ]);

    // usuario → módulo → recursos completados
    const completadosPorModulo = new Map<string, Map<string, number>>();
    for (const paso of progreso) {
      const porModulo = completadosPorModulo.get(paso.usuario_guid) ?? new Map<string, number>();
      const moduloGuid = paso.recurso.modulo_guid;
      porModulo.set(moduloGuid, (porModulo.get(moduloGuid) ?? 0) + 1);
      completadosPorModulo.set(paso.usuario_guid, porModulo);
    }

    const entregasPorUsuario = new Map(entregas.map((e) => [e.usuario_guid, e._count.guid]));
    const cursosPorGuid = new Map(cursos.map((c) => [c.guid, c]));

    // Un alumno puede estar en varios cursos del mismo examinador: se agrupa por persona.
    const porAlumno = new Map<string, ReturnType<typeof this.filaDeAlumno>>();

    for (const matricula of matriculas) {
      const curso = cursosPorGuid.get(matricula.curso_guid);
      if (!curso) continue;

      const alumno = matricula.usuario;
      const fila =
        porAlumno.get(alumno.guid) ??
        this.filaDeAlumno(alumno, entregasPorUsuario.get(alumno.guid) ?? 0);

      const completados = completadosPorModulo.get(alumno.guid) ?? new Map<string, number>();
      const modulos = curso.modulos.map((modulo) => {
        const total = modulo._count.recursos;
        const hechos = Math.min(completados.get(modulo.guid) ?? 0, total);
        return {
          guid: modulo.guid,
          titulo: modulo.titulo,
          total,
          completados: hechos,
          porcentaje: total > 0 ? Math.round((hechos / total) * 100) : 0,
        };
      });

      const total = modulos.reduce((suma, m) => suma + m.total, 0);
      const hechos = modulos.reduce((suma, m) => suma + m.completados, 0);

      fila.cursos.push({
        curso_guid: curso.guid,
        curso_titulo: curso.titulo,
        total_recursos: total,
        completados: hechos,
        porcentaje: total > 0 ? Math.round((hechos / total) * 100) : 0,
        modulos,
      });

      porAlumno.set(alumno.guid, fila);
    }

    return [...porAlumno.values()];
  }

  private filaDeAlumno(
    alumno: { guid: string; nombre: string; apellido: string; email: string; ultimo_acceso: Date | null },
    totalEntregas: number,
  ) {
    return {
      guid: alumno.guid,
      nombre: alumno.nombre,
      apellido: alumno.apellido,
      email: alumno.email,
      ultimo_acceso: alumno.ultimo_acceso,
      total_entregas: totalEntregas,
      cursos: [] as {
        curso_guid: string;
        curso_titulo: string;
        total_recursos: number;
        completados: number;
        porcentaje: number;
        modulos: { guid: string; titulo: string; total: number; completados: number; porcentaje: number }[];
      }[],
    };
  }

  /** Detalle del avance de un alumno concreto en un curso que gestiona el usuario. */
  async getDetalleDeAlumno(cursoGuid: string, alumnoGuid: string, user: JwtPayload) {
    await this.acceso.cursoQueGestiona(cursoGuid, user);
    await this.acceso.asegurarMatricula(cursoGuid, alumnoGuid);

    const [recursos, progreso, entregas, tiempo] = await Promise.all([
      this.acceso.recursosDelCurso(cursoGuid),
      this.prisma.lms_progreso_recurso.findMany({
        where: { usuario_guid: alumnoGuid, recurso: { modulo: { curso_guid: cursoGuid } } },
        select: { recurso_guid: true, fecha_completado: true },
      }),
      this.prisma.lms_entregas.findMany({
        where: { usuario_guid: alumnoGuid, tarea: { modulo: { curso_guid: cursoGuid } } },
        select: { tarea_guid: true, estado: true, calificacion: true, fecha_entrega: true, intento_numero: true },
      }),
      this.prisma.lms_sesion_activa.aggregate({
        where: { usuario_guid: alumnoGuid, curso_guid: cursoGuid },
        _sum: { duracion_seg: true },
      }),
    ]);

    const completados = new Map(progreso.map((p) => [p.recurso_guid, p.fecha_completado]));
    const porTarea = new Map(entregas.map((e) => [e.tarea_guid, e]));

    return {
      total_recursos: recursos.length,
      completados: completados.size,
      porcentaje: recursos.length > 0 ? Math.round((completados.size / recursos.length) * 100) : 0,
      horas_estudio: Math.round(((tiempo._sum.duracion_seg ?? 0) / 3600) * 10) / 10,
      promedio: promedioNotas(entregas.map((e) => e.calificacion)),
      recursos: recursos.map((recurso) => {
        const entrega = porTarea.get(recurso.guid);
        return {
          guid: recurso.guid,
          titulo: recurso.titulo,
          tipo: recurso.tipo,
          completado: completados.has(recurso.guid),
          fecha_completado: completados.get(recurso.guid) ?? null,
          estado_entrega: entrega?.estado ?? null,
          calificacion: entrega?.calificacion != null ? Number(entrega.calificacion) : null,
          intento_numero: entrega?.intento_numero ?? null,
        };
      }),
    };
  }
}
