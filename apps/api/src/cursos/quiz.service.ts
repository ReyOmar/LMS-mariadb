import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CursoAccesoService } from './curso-acceso.service';
import { ConfiguracionQuiz, parsearConfiguracionQuiz, respuestasCorrectas, sinRespuestas } from './quiz-config';
import { esAprobada, notaDeCuestionario, umbralAprobacion } from '../common/domain/calificacion';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

/** Margen de gracia sobre el límite de tiempo, para absorber la latencia del envío. */
const MARGEN_TIEMPO_MS = 30_000;

/** Estado de un cuestionario para un alumno concreto. */
export interface EstadoQuiz {
  intentos_realizados: number;
  max_intentos: number;
  mejor_nota: number | null;
  nota_aprobacion: number;
  aprobado: boolean;
  intento_en_curso: boolean;
  fecha_inicio: Date | null;
  tiempo_minutos: number;
  puede_reintentar: boolean;
  motivo_bloqueo: string | null;
}

/**
 * Cuestionarios: iniciar un intento, corregirlo y consultar su estado.
 *
 * El recuento de intentos se lleva contando las entregas registradas, sin más.
 * La versión anterior intentaba deducir si un módulo había sido reiniciado comparando
 * «hay entregas calificadas pero no hay registro de progreso» y, cuando lo creía, borraba
 * los intentos previos. El efecto era que `intentos_permitidos` no limitaba nada: cada
 * suspenso borraba el contador y el alumno podía repetir indefinidamente.
 *
 * Ahora las dos cosas están separadas y son explícitas:
 *  - Los intentos **se conservan**, así que el límite configurado se respeta.
 *  - Suspender reinicia el **progreso del módulo** (obliga a repasar el material), pero no
 *    borra el historial de intentos.
 */
@Injectable()
export class QuizService {
  private readonly logger = new Logger(QuizService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly acceso: CursoAccesoService,
    private readonly eventos: EventEmitter2,
  ) {}

  // ── Inicio del intento ───────────────────────────────────────────────────

  /**
   * Abre un intento y devuelve las preguntas **sin las respuestas correctas**.
   *
   * Si ya había un intento abierto se devuelve ese mismo: recargar la página a mitad de un
   * examen no debe consumir un intento ni reiniciar el cronómetro.
   */
  async iniciarIntento(recursoGuid: string, user: JwtPayload) {
    const { config, curso } = await this.cargarCuestionario(recursoGuid, user);

    return this.prisma.$transaction(async (tx) => {
      const enCurso = await tx.lms_entregas.findFirst({
        where: { tarea_guid: recursoGuid, usuario_guid: user.sub, estado: 'BORRADOR' },
        select: { guid: true, fecha_inicio: true },
      });
      if (enCurso) {
        return {
          guid: enCurso.guid,
          fecha_inicio: enCurso.fecha_inicio,
          tiempo_minutos: config.tiempo_minutos,
          preguntas: sinRespuestas(config).preguntas,
        };
      }

      const yaAprobado = await tx.lms_progreso_recurso.findUnique({
        where: { usuario_guid_recurso_guid: { usuario_guid: user.sub, recurso_guid: recursoGuid } },
        select: { id: true },
      });
      if (yaAprobado) {
        throw new BadRequestException('Ya superaste este cuestionario.');
      }

      const intentosPrevios = await tx.lms_entregas.count({
        where: { tarea_guid: recursoGuid, usuario_guid: user.sub, estado: { not: 'BORRADOR' } },
      });
      if (config.intentos_permitidos > 0 && intentosPrevios >= config.intentos_permitidos) {
        throw new BadRequestException(
          `Has agotado los ${config.intentos_permitidos} intento(s) disponibles para este cuestionario. Contacta con tu examinador.`,
        );
      }

      const intento = await tx.lms_entregas.create({
        data: {
          usuario_guid: user.sub,
          tarea_guid: recursoGuid,
          estado: 'BORRADOR',
          fecha_inicio: new Date(),
          intento_numero: intentosPrevios + 1,
        },
        select: { guid: true, fecha_inicio: true },
      });

      this.logger.log(`Intento ${intentosPrevios + 1} iniciado por ${user.sub} en ${curso.titulo}`);

      return {
        guid: intento.guid,
        fecha_inicio: intento.fecha_inicio,
        tiempo_minutos: config.tiempo_minutos,
        preguntas: sinRespuestas(config).preguntas,
      };
    });
  }

  // ── Corrección ───────────────────────────────────────────────────────────

  /**
   * Corrige el intento abierto y devuelve la nota sobre 100.
   *
   * La corrección ocurre íntegramente aquí: el navegador nunca ha tenido las respuestas
   * correctas, así que no puede calcular ni falsear la nota.
   */
  async corregirIntento(recursoGuid: string, user: JwtPayload, respuestas: Record<string, string>) {
    const { config, curso } = await this.cargarCuestionario(recursoGuid, user);
    const umbral = umbralAprobacion(curso.nota_aprobacion);

    const intento = await this.prisma.lms_entregas.findFirst({
      where: { tarea_guid: recursoGuid, usuario_guid: user.sub, estado: 'BORRADOR' },
      select: { guid: true, fecha_inicio: true },
    });
    if (!intento) {
      throw new BadRequestException('No tienes ningún intento abierto. Inicia el cuestionario de nuevo.');
    }

    const fueraDeTiempo = this.excedioElTiempo(intento.fecha_inicio, config.tiempo_minutos);
    const { correctas, total } = fueraDeTiempo
      ? { correctas: 0, total: config.preguntas.length }
      : this.contarAciertos(config, respuestas);

    const nota = fueraDeTiempo ? 0 : notaDeCuestionario(correctas, total);
    const aprobado = esAprobada(nota, umbral);

    // `updateMany` sobre el estado BORRADOR hace la transición atómica: si llegan dos
    // envíos a la vez, sólo uno la consigue y el segundo no crea un intento duplicado.
    const transicion = await this.prisma.lms_entregas.updateMany({
      where: { guid: intento.guid, estado: 'BORRADOR' },
      data: {
        estado: 'CALIFICADA',
        fecha_entrega: new Date(),
        calificacion: nota,
        comentario_calificacion: fueraDeTiempo
          ? 'Se agotó el tiempo disponible.'
          : `${correctas} de ${total} respuestas correctas.`,
      },
    });
    if (transicion.count === 0) {
      throw new BadRequestException('Este intento ya se había enviado.');
    }

    const tituloQuiz = await this.tituloDelRecurso(recursoGuid);

    if (aprobado) {
      await this.registrarAprobado(recursoGuid, user.sub);
      this.eventos.emit('quiz.aprobado', {
        usuario_guid: user.sub,
        pais: user.pais,
        recurso_guid: recursoGuid,
        curso_guid: curso.guid,
        nota,
        titulo_quiz: tituloQuiz,
      });
    } else {
      await this.reiniciarProgresoDelModulo(recursoGuid, user.sub);
      this.eventos.emit('quiz.suspendido', {
        usuario_guid: user.sub,
        pais: user.pais,
        recurso_guid: recursoGuid,
        nota,
        nota_aprobacion: umbral,
        titulo_quiz: tituloQuiz,
        curso_guid: curso.guid,
        curso_titulo: curso.titulo,
        profesor_guid: curso.profesor_guid,
      });
    }

    return { nota, aprobado, correctas, total, nota_aprobacion: umbral, fuera_de_tiempo: fueraDeTiempo };
  }

  private contarAciertos(config: ConfiguracionQuiz, respuestas: Record<string, string>) {
    const correctas = respuestasCorrectas(config);
    let aciertos = 0;
    for (const [preguntaId, opcionCorrecta] of correctas) {
      if (respuestas[preguntaId] === opcionCorrecta) aciertos++;
    }
    return { correctas: aciertos, total: config.preguntas.length };
  }

  private excedioElTiempo(inicio: Date | null, minutos: number): boolean {
    if (minutos <= 0 || !inicio) return false;
    return Date.now() - inicio.getTime() > minutos * 60_000 + MARGEN_TIEMPO_MS;
  }

  /** Marca el cuestionario como superado. Idempotente. */
  private async registrarAprobado(recursoGuid: string, usuarioGuid: string): Promise<void> {
    await this.prisma.lms_progreso_recurso.upsert({
      where: { usuario_guid_recurso_guid: { usuario_guid: usuarioGuid, recurso_guid: recursoGuid } },
      create: { usuario_guid: usuarioGuid, recurso_guid: recursoGuid, completado: true },
      update: {},
    });
  }

  /**
   * Devuelve al alumno al principio del módulo tras suspender: se borra el progreso de los
   * recursos de ese módulo para que tenga que repasarlos antes de volver a intentarlo.
   *
   * No se tocan las entregas de tareas evaluadas por el examinador: su calificación es
   * trabajo ya hecho y corregido, y perderla obligaría a repetir una corrección manual.
   */
  private async reiniciarProgresoDelModulo(recursoGuid: string, usuarioGuid: string): Promise<void> {
    const recurso = await this.prisma.lms_recursos.findUnique({
      where: { guid: recursoGuid },
      select: { modulo_guid: true },
    });
    if (!recurso) return;

    const delModulo = await this.prisma.lms_recursos.findMany({
      where: { modulo_guid: recurso.modulo_guid },
      select: { guid: true, tipo: true, quiz_config: true },
    });

    // Se reinician los recursos de estudio y los cuestionarios; las tareas con entrega
    // calificada se conservan.
    const aReiniciar = delModulo
      .filter((r) => r.tipo !== 'TAREA' || r.quiz_config !== null)
      .map((r) => r.guid);

    if (aReiniciar.length === 0) return;

    await this.prisma.lms_progreso_recurso.deleteMany({
      where: { usuario_guid: usuarioGuid, recurso_guid: { in: aReiniciar } },
    });
  }

  // ── Estado ───────────────────────────────────────────────────────────────

  /** Estado del cuestionario para el alumno: intentos, mejor nota y si puede reintentar. */
  async getEstado(recursoGuid: string, user: JwtPayload): Promise<EstadoQuiz> {
    const { config, curso } = await this.cargarCuestionario(recursoGuid, user);
    const umbral = umbralAprobacion(curso.nota_aprobacion);

    const [intentos, enCurso, progreso] = await Promise.all([
      this.prisma.lms_entregas.findMany({
        where: { tarea_guid: recursoGuid, usuario_guid: user.sub, estado: 'CALIFICADA' },
        select: { calificacion: true },
      }),
      this.prisma.lms_entregas.findFirst({
        where: { tarea_guid: recursoGuid, usuario_guid: user.sub, estado: 'BORRADOR' },
        select: { fecha_inicio: true },
      }),
      this.prisma.lms_progreso_recurso.findUnique({
        where: { usuario_guid_recurso_guid: { usuario_guid: user.sub, recurso_guid: recursoGuid } },
        select: { id: true },
      }),
    ]);

    const notas = intentos.map((i) => Number(i.calificacion ?? 0));
    const mejorNota = notas.length > 0 ? Math.max(...notas) : null;
    const aprobado = Boolean(progreso);
    const limiteAlcanzado = config.intentos_permitidos > 0 && intentos.length >= config.intentos_permitidos;

    return {
      intentos_realizados: intentos.length,
      max_intentos: config.intentos_permitidos,
      mejor_nota: mejorNota,
      nota_aprobacion: umbral,
      aprobado,
      intento_en_curso: Boolean(enCurso),
      fecha_inicio: enCurso?.fecha_inicio ?? null,
      tiempo_minutos: config.tiempo_minutos,
      puede_reintentar: !aprobado && !enCurso && !limiteAlcanzado,
      motivo_bloqueo: this.motivoDeBloqueo(aprobado, Boolean(enCurso), limiteAlcanzado, config.intentos_permitidos),
    };
  }

  /** Explica al alumno por qué no puede empezar, en lugar de dejar el botón inerte. */
  private motivoDeBloqueo(
    aprobado: boolean,
    enCurso: boolean,
    limiteAlcanzado: boolean,
    maxIntentos: number,
  ): string | null {
    if (aprobado) return 'Ya superaste este cuestionario.';
    if (enCurso) return 'Tienes un intento en curso. Continúalo para poder finalizarlo.';
    if (limiteAlcanzado) {
      return `Has agotado los ${maxIntentos} intento(s) disponibles. Contacta con tu examinador para que te habilite otro.`;
    }
    return null;
  }

  // ── Común ────────────────────────────────────────────────────────────────

  /**
   * Carga el cuestionario comprobando antes el acceso: sede, matrícula y curso publicado.
   * Toda entrada al servicio pasa por aquí, así que no hay ningún camino que salte la
   * comprobación.
   */
  private async cargarCuestionario(recursoGuid: string, user: JwtPayload) {
    const curso = await this.acceso.asegurarAccesoARecurso(recursoGuid, user);

    const recurso = await this.prisma.lms_recursos.findUnique({
      where: { guid: recursoGuid },
      select: { quiz_config: true, tipo: true },
    });
    if (!recurso || recurso.tipo !== 'TAREA' || !recurso.quiz_config) {
      throw new BadRequestException('Este recurso no es un cuestionario.');
    }

    return { config: parsearConfiguracionQuiz(recurso.quiz_config), curso };
  }

  private async tituloDelRecurso(recursoGuid: string): Promise<string> {
    const recurso = await this.prisma.lms_recursos.findUnique({
      where: { guid: recursoGuid },
      select: { titulo: true },
    });
    return recurso?.titulo.replace(/^\[QUIZ\]\s*/, '') ?? 'Cuestionario';
  }
}
