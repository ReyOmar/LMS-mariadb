import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { RealtimeService } from '../realtime/realtime.service';
import { MailService } from '../mail/mail.service';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { CursoAccesoService } from '../cursos/curso-acceso.service';
import { promedioNotas } from '../common/domain/calificacion';
import { Pais } from '../common/domain/pais';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { componerCertificado } from './certificado-pdf';

/** Horas mínimas que se imprimen cuando el tiempo registrado es insignificante. */
const HORAS_MINIMAS = 0.1;

/** Resultado de comprobar si un alumno ya puede recibir su certificado. */
export interface EstadoFinalizacion {
  completo: boolean;
  puede_certificarse: boolean;
  completados: number;
  total: number;
  porcentaje: number;
  tareas_pendientes: { recurso_guid: string; titulo: string; estado: string | null }[];
  motivo: string | null;
}

/**
 * Certificados de finalización.
 *
 * Un certificado se emite cuando el alumno ha completado **todos** los recursos del curso
 * y **todas** sus tareas están calificadas. Es un documento con valor probatorio, así que
 * la emisión es idempotente (un certificado por alumno y curso) y lleva un código de
 * verificación consultable públicamente.
 */
@Injectable()
export class CertificadosService {
  private readonly logger = new Logger(CertificadosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly acceso: CursoAccesoService,
    private readonly storage: StorageService,
    private readonly configuracion: ConfiguracionService,
    private readonly realtime: RealtimeService,
    private readonly mail: MailService,
  ) {}

  // ── Comprobación de finalización ─────────────────────────────────────────

  /**
   * Comprueba si un alumno cumple los requisitos del certificado y, si no, explica cuál
   * falta. El mensaje es el que ve el alumno, así que nombra las tareas pendientes en vez
   * de decir sólo que «no puede».
   */
  async comprobarFinalizacion(cursoGuid: string, usuarioGuid: string): Promise<EstadoFinalizacion> {
    const recursos = await this.acceso.recursosDelCurso(cursoGuid);

    if (recursos.length === 0) {
      return {
        completo: false,
        puede_certificarse: false,
        completados: 0,
        total: 0,
        porcentaje: 0,
        tareas_pendientes: [],
        motivo: 'Este curso todavía no tiene contenido.',
      };
    }

    const guids = recursos.map((r) => r.guid);
    const tareas = recursos.filter((r) => r.tipo === 'TAREA');

    const [progreso, entregas] = await Promise.all([
      this.prisma.lms_progreso_recurso.findMany({
        where: { usuario_guid: usuarioGuid, recurso_guid: { in: guids } },
        select: { recurso_guid: true },
      }),
      tareas.length > 0
        ? this.prisma.lms_entregas.findMany({
            where: { usuario_guid: usuarioGuid, tarea_guid: { in: tareas.map((t) => t.guid) } },
            select: { tarea_guid: true, estado: true },
          })
        : Promise.resolve([]),
    ]);

    const completados = new Set(progreso.map((p) => p.recurso_guid));
    const estadoPorTarea = new Map<string, string>(
      entregas.flatMap((e) => (e.tarea_guid ? [[e.tarea_guid, String(e.estado)] as [string, string]] : [])),
    );

    const pendientes = tareas
      .filter((tarea) => estadoPorTarea.get(tarea.guid) !== 'CALIFICADA')
      .map((tarea) => ({
        recurso_guid: tarea.guid,
        titulo: tarea.titulo,
        estado: estadoPorTarea.get(tarea.guid) ?? null,
      }));

    const completo = completados.size === recursos.length;
    const puedeCertificarse = completo && pendientes.length === 0;

    return {
      completo,
      puede_certificarse: puedeCertificarse,
      completados: completados.size,
      total: recursos.length,
      porcentaje: Math.round((completados.size / recursos.length) * 100),
      tareas_pendientes: pendientes,
      motivo: this.motivoDeBloqueo(completo, recursos.length - completados.size, pendientes),
    };
  }

  private motivoDeBloqueo(
    completo: boolean,
    faltantes: number,
    pendientes: { titulo: string }[],
  ): string | null {
    if (!completo) {
      return `Te faltan ${faltantes} recurso(s) por completar antes de poder obtener el certificado.`;
    }
    if (pendientes.length > 0) {
      const nombres = pendientes.map((t) => `"${t.titulo}"`).join(', ');
      return `Tu examinador todavía debe calificar ${pendientes.length} tarea(s): ${nombres}.`;
    }
    return null;
  }

  // ── Emisión ──────────────────────────────────────────────────────────────

  /**
   * Emite el certificado del alumno en sesión para un curso.
   * Si ya existe se devuelve el mismo: un alumno no puede tener dos certificados del
   * mismo curso con códigos de verificación distintos.
   */
  async emitirParaUsuario(cursoGuid: string, user: JwtPayload) {
    await this.acceso.cursoDeSede(cursoGuid, user.pais);
    await this.acceso.asegurarMatricula(cursoGuid, user.sub);
    return this.emitir(cursoGuid, user.sub, user.pais);
  }

  /**
   * Emite el certificado si el alumno cumple los requisitos, y no hace nada si no.
   * Lo invoca el listener de eventos cada vez que un progreso o una calificación pueden
   * haber cerrado el curso.
   */
  async emitirSiProcede(cursoGuid: string, usuarioGuid: string, pais: Pais): Promise<void> {
    const yaTiene = await this.prisma.lms_certificados.findUnique({
      where: { usuario_guid_curso_guid: { usuario_guid: usuarioGuid, curso_guid: cursoGuid } },
      select: { id: true },
    });
    if (yaTiene) return;

    const estado = await this.comprobarFinalizacion(cursoGuid, usuarioGuid);
    if (!estado.puede_certificarse) return;

    await this.emitir(cursoGuid, usuarioGuid, pais);
    this.logger.log(`Certificado emitido automáticamente: alumno ${usuarioGuid}, curso ${cursoGuid}`);
  }

  private async emitir(cursoGuid: string, usuarioGuid: string, pais: Pais) {
    const existente = await this.prisma.lms_certificados.findUnique({
      where: { usuario_guid_curso_guid: { usuario_guid: usuarioGuid, curso_guid: cursoGuid } },
      include: { curso: { select: { titulo: true } } },
    });
    if (existente) {
      // Reintenta la limpieza de archivos por si falló en la emisión original.
      void this.purgarEntregas(cursoGuid, usuarioGuid);
      return this.paraElAlumno(existente);
    }

    const estado = await this.comprobarFinalizacion(cursoGuid, usuarioGuid);
    if (!estado.puede_certificarse) {
      throw new BadRequestException(estado.motivo ?? 'Todavía no cumples los requisitos del certificado.');
    }

    const datos = await this.reunirDatos(cursoGuid, usuarioGuid, pais);
    const pdf = await componerCertificado(datos.certificado);

    const clave = `certificados/${crypto.randomUUID()}.pdf`;
    await this.storage.guardarConClave(clave, pdf, 'application/pdf');

    const certificado = await this.prisma.lms_certificados.create({
      data: {
        usuario_guid: usuarioGuid,
        curso_guid: cursoGuid,
        codigo_verificacion: datos.certificado.codigoVerificacion,
        archivo_pdf: clave,
        fecha_inicio: datos.certificado.fechaInicio,
        fecha_completado: datos.certificado.fechaCompletado,
        tiempo_total_horas: datos.certificado.tiempoHoras,
        tiempo_activo_seg: datos.segundosActivos,
        nota_promedio: datos.certificado.notaPromedio,
      },
      include: { curso: { select: { titulo: true } } },
    });

    this.realtime.emitirAUsuarios(
      'certificate:new',
      { guid: certificado.guid, curso_guid: cursoGuid, curso_titulo: datos.certificado.tituloCurso },
      pais,
      [usuarioGuid],
    );

    void this.avisarDeLaEmision(certificado.guid, datos, pais);
    void this.purgarEntregas(cursoGuid, usuarioGuid);

    return this.paraElAlumno(certificado);
  }

  /** Reúne del curso, el alumno y la configuración todo lo que se imprime en el PDF. */
  private async reunirDatos(cursoGuid: string, usuarioGuid: string, pais: Pais) {
    const [usuario, curso, matricula, config, recursos] = await Promise.all([
      this.prisma.usuarios.findUnique({
        where: { guid: usuarioGuid },
        select: { nombre: true, apellido: true, email: true },
      }),
      this.prisma.lms_cursos.findUnique({
        where: { guid: cursoGuid },
        select: {
          titulo: true,
          duracion_horas: true,
          profesor_guid: true,
          profesor: {
            select: { nombre: true, apellido: true, email: true, firma_url: true, firma_nombre: true, firma_cargo: true },
          },
          _count: { select: { modulos: true } },
        },
      }),
      this.prisma.lms_matriculas.findUnique({
        where: { usuario_guid_curso_guid: { usuario_guid: usuarioGuid, curso_guid: cursoGuid } },
        select: { fecha_matricula: true },
      }),
      this.configuracion.getConfig(pais),
      this.acceso.recursosDelCurso(cursoGuid),
    ]);

    if (!usuario || !curso) throw new NotFoundException('No se encontró el alumno o el curso.');

    const [notas, tiempo] = await Promise.all([
      this.prisma.lms_entregas.findMany({
        where: {
          usuario_guid: usuarioGuid,
          estado: 'CALIFICADA',
          calificacion: { not: null },
          tarea: { modulo: { curso_guid: cursoGuid } },
        },
        select: { calificacion: true },
      }),
      this.prisma.lms_sesion_activa.aggregate({
        where: { usuario_guid: usuarioGuid, curso_guid: cursoGuid },
        _sum: { duracion_seg: true },
      }),
    ]);

    const segundosActivos = tiempo._sum.duracion_seg ?? 0;
    const horasReales = Math.max(segundosActivos / 3600, HORAS_MINIMAS);
    const totalTareas = recursos.filter((r) => r.tipo === 'TAREA').length;

    const [logo, firma] = await Promise.all([
      this.cargarImagen(config.logo_url),
      config.cert_mostrar_firma ? this.cargarImagen(curso.profesor.firma_url) : Promise.resolve(null),
    ]);

    return {
      segundosActivos,
      alumnoEmail: usuario.email,
      alumnoNombre: usuario.nombre,
      profesorEmail: curso.profesor.email,
      profesorNombre: curso.profesor.nombre,
      certificado: {
        nombreEstudiante: `${usuario.nombre} ${usuario.apellido}`,
        tituloCurso: curso.titulo,
        fechaInicio: matricula?.fecha_matricula ?? new Date(),
        fechaCompletado: new Date(),
        tiempoHoras: segundosActivos > 0 ? Math.round(horasReales * 10) / 10 : (curso.duracion_horas ?? 1),
        notaPromedio: promedioNotas(notas.map((n) => n.calificacion)),
        codigoVerificacion: this.generarCodigo(),
        nombreProfesor: `${curso.profesor.nombre} ${curso.profesor.apellido}`,
        nombrePlataforma: config.nombre_plataforma,
        colorPrimario: config.color_primario,
        colorSecundario: config.color_secundario,
        totalModulos: curso._count.modulos,
        totalRecursos: recursos.length,
        textoLegal:
          config.cert_texto_legal ||
          `El presente certificado acredita que el participante cumplió satisfactoriamente la totalidad del programa de capacitación, compuesto por ${curso._count.modulos} módulo(s) y ${recursos.length} recurso(s) formativo(s), incluyendo ${totalTareas} evaluación(es) calificada(s) por el examinador asignado.`,
        tituloPersonalizado: config.cert_titulo_personalizado,
        subtitulo: config.cert_subtitulo,
        mostrarModulos: config.cert_mostrar_modulos,
        mostrarRecursos: config.cert_mostrar_recursos,
        mostrarNota: config.cert_mostrar_nota,
        mostrarFirma: config.cert_mostrar_firma,
        mostrarFechaIngreso: config.cert_mostrar_fecha_ingreso,
        firmaNombre: curso.profesor.firma_nombre,
        firmaCargo: curso.profesor.firma_cargo,
        logo,
        firma,
      },
    };
  }

  /**
   * Carga una imagen del almacenamiento para incrustarla en el PDF.
   * Devuelve `null` si no está: un certificado sin logotipo es preferible a no poder
   * emitirlo, pero el fallo se registra para que alguien lo corrija.
   */
  private async cargarImagen(clave: string | null): Promise<Buffer | null> {
    if (!clave) return null;
    try {
      const archivo = await this.storage.leer(clave);
      if (!archivo) {
        this.logger.warn(`Imagen del certificado no encontrada: ${clave}`);
        return null;
      }
      return archivo.contenido;
    } catch (error) {
      this.logger.warn(`No se pudo cargar la imagen ${clave} para el certificado`, error);
      return null;
    }
  }

  /** Código legible, único y difícil de adivinar para la verificación pública. */
  private generarCodigo(): string {
    const aleatorio = crypto.randomBytes(5).toString('hex').toUpperCase();
    const marca = Date.now().toString(36).toUpperCase();
    return `CERT-${aleatorio}-${marca}`;
  }

  private async avisarDeLaEmision(
    certificadoGuid: string,
    datos: Awaited<ReturnType<CertificadosService['reunirDatos']>>,
    pais: Pais,
  ): Promise<void> {
    try {
      await Promise.all([
        this.mail.sendCertificateGenerated(
          datos.alumnoEmail,
          datos.alumnoNombre,
          datos.certificado.tituloCurso,
          datos.certificado.codigoVerificacion,
          pais,
        ),
        this.mail.sendCourseCompletedNotification(
          datos.profesorEmail,
          datos.profesorNombre,
          datos.certificado.nombreEstudiante,
          datos.certificado.tituloCurso,
          pais,
        ),
      ]);
    } catch (error) {
      this.logger.error(`No se pudo avisar de la emisión del certificado ${certificadoGuid}`, error);
    }
  }

  // ── Consulta ─────────────────────────────────────────────────────────────

  /** Certificados del alumno en sesión. */
  async getMisCertificados(user: JwtPayload) {
    const certificados = await this.prisma.lms_certificados.findMany({
      where: { usuario_guid: user.sub },
      include: { curso: { select: { titulo: true, imagen_portada: true } } },
      orderBy: { fecha_completado: 'desc' },
    });
    return certificados.map((c) => this.paraElAlumno(c));
  }

  /**
   * Certificado concreto. Sólo su titular o un administrador de la misma sede pueden
   * consultarlo: antes bastaba con conocer el identificador para descargar el PDF de
   * cualquier persona.
   */
  async getCertificado(guid: string, user: JwtPayload) {
    const certificado = await this.prisma.lms_certificados.findUnique({
      where: { guid },
      include: {
        curso: { select: { titulo: true, imagen_portada: true, pais: true } },
        usuario: { select: { guid: true, nombre: true, apellido: true, pais: true } },
      },
    });
    if (!certificado) throw new NotFoundException('Certificado no encontrado.');

    const esSuyo = certificado.usuario_guid === user.sub;
    const esAdminDeLaSede = user.role === 'ADMINISTRADOR' && certificado.usuario.pais === user.pais;
    if (!esSuyo && !esAdminDeLaSede) {
      throw new ForbiddenException('No tienes permiso para consultar este certificado.');
    }

    return certificado;
  }

  /** Contenido del PDF, comprobando antes que quien lo pide tiene derecho a verlo. */
  async getPdf(guid: string, user: JwtPayload): Promise<{ contenido: Buffer; nombre: string }> {
    const certificado = await this.getCertificado(guid, user);

    const archivo = await this.storage.leer(certificado.archivo_pdf);
    if (!archivo) {
      throw new NotFoundException(
        'El archivo del certificado no está disponible. Avisa al administrador para que lo vuelva a emitir.',
      );
    }

    const nombreCurso = certificado.curso.titulo.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'Curso';
    return { contenido: archivo.contenido, nombre: `Certificado - ${nombreCurso}.pdf` };
  }

  /**
   * Verificación pública por código.
   * Devuelve sólo lo imprescindible para comprobar la autenticidad de un documento: quién,
   * qué curso y cuándo. Ni correo, ni identificadores internos, ni enlace al PDF.
   */
  async verificarPorCodigo(codigo: string) {
    const certificado = await this.prisma.lms_certificados.findUnique({
      where: { codigo_verificacion: codigo.trim().toUpperCase() },
      select: {
        codigo_verificacion: true,
        fecha_completado: true,
        nota_promedio: true,
        tiempo_total_horas: true,
        curso: { select: { titulo: true } },
        usuario: { select: { nombre: true, apellido: true } },
      },
    });

    if (!certificado) {
      return { valido: false as const, mensaje: 'No existe ningún certificado con ese código de verificación.' };
    }

    return {
      valido: true as const,
      certificado: {
        nombre_estudiante: `${certificado.usuario.nombre} ${certificado.usuario.apellido}`,
        curso: certificado.curso.titulo,
        fecha_emision: certificado.fecha_completado,
        horas: Number(certificado.tiempo_total_horas),
        nota_promedio: certificado.nota_promedio === null ? null : Number(certificado.nota_promedio),
        codigo_verificacion: certificado.codigo_verificacion,
      },
    };
  }

  private paraElAlumno(certificado: {
    guid: string;
    curso_guid: string;
    codigo_verificacion: string;
    fecha_completado: Date;
    tiempo_total_horas: unknown;
    nota_promedio: unknown;
    curso: { titulo: string; imagen_portada?: string | null };
  }) {
    return {
      guid: certificado.guid,
      curso_guid: certificado.curso_guid,
      curso_titulo: certificado.curso.titulo,
      curso_imagen: certificado.curso.imagen_portada ?? null,
      codigo_verificacion: certificado.codigo_verificacion,
      fecha_completado: certificado.fecha_completado,
      horas: Number(certificado.tiempo_total_horas),
      nota_promedio: certificado.nota_promedio === null ? null : Number(certificado.nota_promedio),
    };
  }

  // ── Limpieza ─────────────────────────────────────────────────────────────

  /**
   * Retira los archivos de las entregas una vez emitido el certificado.
   *
   * El certificado es ya el documento que acredita la capacitación, así que conservar los
   * borradores entregados sólo consume almacenamiento. Se conserva el nombre original del
   * archivo y la calificación: el alumno sigue viendo qué entregó y qué nota obtuvo.
   */
  async purgarEntregas(cursoGuid: string, usuarioGuid: string): Promise<void> {
    try {
      const entregas = await this.prisma.lms_entregas.findMany({
        where: {
          usuario_guid: usuarioGuid,
          archivo_purgado: false,
          url_archivo_adjunto: { not: null },
          tarea: { modulo: { curso_guid: cursoGuid } },
        },
        select: { guid: true, url_archivo_adjunto: true },
      });
      if (entregas.length === 0) return;

      for (const entrega of entregas) {
        // Se marca primero y se borra después: si el borrado falla, la fila ya no apunta a
        // un archivo que podría no existir, y el mantenimiento semanal lo recoge.
        await this.prisma.lms_entregas.update({
          where: { guid: entrega.guid },
          data: { url_archivo_adjunto: null, archivo_purgado: true },
        });
        await this.storage
          .deleteFile(entrega.url_archivo_adjunto)
          .catch((error) => this.logger.warn(`No se pudo borrar ${entrega.url_archivo_adjunto}`, error));
      }

      this.logger.log(`Entregas purgadas tras certificar: ${entregas.length} (alumno ${usuarioGuid})`);
    } catch (error) {
      this.logger.error(`Fallo al purgar entregas del curso ${cursoGuid}`, error);
    }
  }
}
