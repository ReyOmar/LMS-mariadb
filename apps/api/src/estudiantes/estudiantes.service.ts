import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CursoAccesoService } from '../cursos/curso-acceso.service';
import { aNota, promedioNotas } from '../common/domain/calificacion';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

/**
 * Horas que una entrega puede llevar esperando calificación antes de que el sistema
 * desbloquee el siguiente recurso por su cuenta.
 *
 * Existe para que un examinador ausente no deje a un alumno bloqueado indefinidamente. El
 * desbloqueo no da la tarea por aprobada: sólo permite seguir estudiando mientras llega la
 * corrección, y el certificado sigue exigiendo que todas las tareas estén calificadas.
 */
export const HORAS_DESBLOQUEO_AUTOMATICO = 48;

/** Cada cuánto manda un latido el visor de curso. Debe coincidir con el cliente. */
const LATIDO_SEGUNDOS = 60;

/** Hueco a partir del cual se considera que empezó una sesión nueva. */
const CORTE_SESION_SEGUNDOS = 150;

/**
 * Progreso, métricas y tiempo de estudio del alumno.
 *
 * Todos los métodos trabajan sobre el usuario en sesión. La versión anterior aceptaba un
 * `?usuario_guid=` que, cuando venía, sustituía al del token: cualquier alumno podía leer
 * el progreso de otro y, peor, marcar recursos como completados en su nombre.
 */
@Injectable()
export class EstudiantesService {
  private readonly logger = new Logger(EstudiantesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly acceso: CursoAccesoService,
    private readonly eventos: EventEmitter2,
  ) {}

  // ── Progreso ─────────────────────────────────────────────────────────────

  /**
   * Estado de avance del alumno en un curso: qué tiene completado, qué se le desbloqueó
   * por espera y qué tareas siguen pendientes de calificación.
   */
  async getProgreso(cursoGuid: string, user: JwtPayload) {
    const curso = await this.acceso.cursoDeSede(cursoGuid, user.pais);
    await this.acceso.asegurarMatricula(cursoGuid, user.sub);

    const recursos = await this.acceso.recursosDelCurso(cursoGuid);
    if (recursos.length === 0) {
      return {
        completados: [],
        desbloqueados_por_espera: [],
        tareas_pendientes: [],
        total_recursos: 0,
        porcentaje: 0,
        orden_estricto: true,
      };
    }

    const guids = recursos.map((r) => r.guid);
    const [progreso, entregasPendientes] = await Promise.all([
      this.prisma.lms_progreso_recurso.findMany({
        where: { usuario_guid: user.sub, recurso_guid: { in: guids } },
        select: { recurso_guid: true },
      }),
      this.prisma.lms_entregas.findMany({
        where: {
          usuario_guid: user.sub,
          tarea_guid: { in: guids },
          estado: { in: ['ENTREGADA', 'EN_REVISION'] },
        },
        select: { tarea_guid: true, fecha_entrega: true },
      }),
    ]);

    const completados = progreso.map((p) => p.recurso_guid);
    const completadosSet = new Set(completados);
    const titulos = new Map(recursos.map((r) => [r.guid, r.titulo]));

    const limite = Date.now() - HORAS_DESBLOQUEO_AUTOMATICO * 60 * 60 * 1000;
    const desbloqueados: string[] = [];
    const pendientes: { recurso_guid: string; titulo: string; fecha_entrega: string | null }[] = [];

    for (const entrega of entregasPendientes) {
      if (!entrega.tarea_guid) continue;

      pendientes.push({
        recurso_guid: entrega.tarea_guid,
        titulo: titulos.get(entrega.tarea_guid) ?? 'Tarea',
        fecha_entrega: entrega.fecha_entrega?.toISOString() ?? null,
      });

      const esperandoDemasiado = entrega.fecha_entrega !== null && entrega.fecha_entrega.getTime() <= limite;
      if (esperandoDemasiado && !completadosSet.has(entrega.tarea_guid)) {
        desbloqueados.push(entrega.tarea_guid);
      }
    }

    return {
      completados,
      desbloqueados_por_espera: desbloqueados,
      tareas_pendientes: pendientes,
      total_recursos: recursos.length,
      porcentaje: Math.round((completados.length / recursos.length) * 100),
      orden_estricto: true,
      curso_titulo: curso.titulo,
    };
  }

  /**
   * Marca un recurso como completado.
   *
   * Sólo aplica a recursos de estudio: las tareas y los cuestionarios se completan al
   * aprobarlos, no porque el navegador diga que se leyeron. Antes este endpoint aceptaba
   * cualquier recurso y cualquier usuario, de modo que un alumno podía darse por
   * completado un examen sin hacerlo.
   */
  async marcarRecursoCompletado(recursoGuid: string, user: JwtPayload) {
    const curso = await this.acceso.asegurarAccesoARecurso(recursoGuid, user);

    const recurso = await this.prisma.lms_recursos.findUnique({
      where: { guid: recursoGuid },
      select: { tipo: true, quiz_config: true },
    });
    if (!recurso) {
      return { completado: false, motivo: 'El recurso ya no existe.' };
    }
    if (recurso.tipo === 'TAREA') {
      return {
        completado: false,
        motivo: recurso.quiz_config
          ? 'Este cuestionario se completa al aprobarlo.'
          : 'Esta tarea se completa cuando el examinador la califica.',
      };
    }

    await this.prisma.lms_progreso_recurso.upsert({
      where: { usuario_guid_recurso_guid: { usuario_guid: user.sub, recurso_guid: recursoGuid } },
      create: { usuario_guid: user.sub, recurso_guid: recursoGuid, completado: true },
      update: {},
    });

    // Completar un recurso puede ser lo último que faltaba para el certificado.
    this.eventos.emit('progreso.actualizado', {
      usuario_guid: user.sub,
      pais: user.pais,
      curso_guid: curso.guid,
    });

    return { completado: true };
  }

  // ── Métricas ─────────────────────────────────────────────────────────────

  /** Resumen del alumno: cursos, avance, horas de estudio y promedio sobre 100. */
  async getMetricas(user: JwtPayload) {
    const matriculas = await this.prisma.lms_matriculas.findMany({
      where: { usuario_guid: user.sub, activa: true },
      select: { curso_guid: true },
    });
    const cursoGuids = matriculas.map((m) => m.curso_guid);

    if (cursoGuids.length === 0) {
      return {
        total_cursos: 0,
        cursos_completados: 0,
        recursos_completados: 0,
        total_recursos: 0,
        porcentaje: 0,
        total_horas_invertidas: 0,
        promedio_global: null,
      };
    }

    const [recursos, progreso, tiempo, notas] = await Promise.all([
      this.prisma.lms_recursos.findMany({
        where: { modulo: { curso_guid: { in: cursoGuids } } },
        select: { guid: true, modulo: { select: { curso_guid: true } } },
      }),
      this.prisma.lms_progreso_recurso.findMany({
        where: { usuario_guid: user.sub },
        select: { recurso_guid: true },
      }),
      this.prisma.lms_sesion_activa.aggregate({
        where: { usuario_guid: user.sub, curso_guid: { in: cursoGuids } },
        _sum: { duracion_seg: true },
      }),
      this.prisma.lms_entregas.findMany({
        where: { usuario_guid: user.sub, estado: 'CALIFICADA', calificacion: { not: null } },
        select: { calificacion: true },
      }),
    ]);

    const completados = new Set(progreso.map((p) => p.recurso_guid));

    const porCurso = new Map<string, { total: number; hechos: number }>();
    for (const recurso of recursos) {
      const cursoGuid = recurso.modulo.curso_guid;
      const acumulado = porCurso.get(cursoGuid) ?? { total: 0, hechos: 0 };
      acumulado.total++;
      if (completados.has(recurso.guid)) acumulado.hechos++;
      porCurso.set(cursoGuid, acumulado);
    }

    const cursosCompletados = [...porCurso.values()].filter((c) => c.total > 0 && c.hechos === c.total).length;
    const recursosCompletados = [...porCurso.values()].reduce((suma, c) => suma + c.hechos, 0);
    const totalRecursos = recursos.length;

    return {
      total_cursos: cursoGuids.length,
      cursos_completados: cursosCompletados,
      recursos_completados: recursosCompletados,
      total_recursos: totalRecursos,
      porcentaje: totalRecursos > 0 ? Math.round((recursosCompletados / totalRecursos) * 100) : 0,
      total_horas_invertidas: Math.round(((tiempo._sum.duracion_seg ?? 0) / 3600) * 10) / 10,
      promedio_global: promedioNotas(notas.map((n) => n.calificacion)),
    };
  }

  /** Días del mes con actividad registrada, para el calendario del panel del alumno. */
  async getDiasActivos(user: JwtPayload, anio: number, mes: number) {
    // `mes` llega como índice 0–11 desde el cliente, igual que `Date.getMonth()`.
    const inicio = new Date(anio, mes, 1);
    const fin = new Date(anio, mes + 1, 1);

    const [progreso, entregas] = await Promise.all([
      this.prisma.lms_progreso_recurso.findMany({
        where: { usuario_guid: user.sub, fecha_completado: { gte: inicio, lt: fin } },
        select: { fecha_completado: true },
      }),
      this.prisma.lms_entregas.findMany({
        where: { usuario_guid: user.sub, fecha_entrega: { gte: inicio, lt: fin } },
        select: { fecha_entrega: true },
      }),
    ]);

    const dias = new Set<number>();
    for (const p of progreso) dias.add(p.fecha_completado.getDate());
    for (const e of entregas) if (e.fecha_entrega) dias.add(e.fecha_entrega.getDate());

    return { dias: [...dias].sort((a, b) => a - b) };
  }

  // ── Tiempo de estudio ────────────────────────────────────────────────────

  /**
   * Registra un latido del visor de curso para contabilizar tiempo real de estudio.
   *
   * Si el último latido llegó hace poco se alarga la sesión abierta; si hubo un hueco
   * largo se abre una nueva. Así una pestaña olvidada no suma horas: el cliente deja de
   * latir cuando la pestaña no está visible.
   */
  async registrarLatido(cursoGuid: string, user: JwtPayload) {
    await this.acceso.asegurarMatricula(cursoGuid, user.sub);

    const corte = new Date(Date.now() - CORTE_SESION_SEGUNDOS * 1000);
    const abierta = await this.prisma.lms_sesion_activa.findFirst({
      where: { usuario_guid: user.sub, curso_guid: cursoGuid, fin_sesion: { gte: corte } },
      orderBy: { fin_sesion: 'desc' },
      select: { id: true, duracion_seg: true },
    });

    if (abierta) {
      await this.prisma.lms_sesion_activa.update({
        where: { id: abierta.id },
        data: { fin_sesion: new Date(), duracion_seg: abierta.duracion_seg + LATIDO_SEGUNDOS },
      });
    } else {
      await this.prisma.lms_sesion_activa.create({
        data: {
          usuario_guid: user.sub,
          curso_guid: cursoGuid,
          inicio_sesion: new Date(),
          fin_sesion: new Date(),
          duracion_seg: LATIDO_SEGUNDOS,
        },
      });
    }

    return { registrado: true };
  }

  /** Segundos de estudio acumulados por el alumno en un curso. */
  async getTiempoEnCurso(cursoGuid: string, usuarioGuid: string): Promise<number> {
    const total = await this.prisma.lms_sesion_activa.aggregate({
      where: { usuario_guid: usuarioGuid, curso_guid: cursoGuid },
      _sum: { duracion_seg: true },
    });
    return total._sum.duracion_seg ?? 0;
  }

  /** Notas del alumno en un curso, para su boletín. */
  async getNotasDeCurso(cursoGuid: string, user: JwtPayload) {
    await this.acceso.asegurarMatricula(cursoGuid, user.sub);

    const entregas = await this.prisma.lms_entregas.findMany({
      where: { usuario_guid: user.sub, estado: 'CALIFICADA', tarea: { modulo: { curso_guid: cursoGuid } } },
      select: {
        calificacion: true,
        comentario_calificacion: true,
        fecha_entrega: true,
        tarea: { select: { guid: true, titulo: true } },
      },
      orderBy: { fecha_entrega: 'asc' },
    });

    return {
      notas: entregas.map((e) => ({
        recurso_guid: e.tarea?.guid ?? null,
        titulo: e.tarea?.titulo ?? 'Evaluación',
        calificacion: aNota(e.calificacion),
        comentario: e.comentario_calificacion,
        fecha: e.fecha_entrega,
      })),
      promedio: promedioNotas(entregas.map((e) => e.calificacion)),
    };
  }
}
