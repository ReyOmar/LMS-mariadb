import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { MailService } from '../mail/mail.service';
import { StorageService } from '../storage/storage.service';
import { CertificadosService } from '../certificados/certificados.service';
import { HORAS_DESBLOQUEO_AUTOMATICO } from '../estudiantes/estudiantes.service';

/** Días sin entrar tras los cuales se envía un recordatorio. */
const DIAS_INACTIVIDAD = 3;

/** Antigüedad mínima de un archivo para considerarlo huérfano y borrarlo. */
const HORAS_GRACIA_HUERFANOS = 24;

/**
 * Tareas de mantenimiento.
 *
 * Todas llevan un candado en memoria que evita que una ejecución arranque mientras la
 * anterior sigue viva. En cPanel sólo corre una instancia del proceso, así que basta;
 * si algún día se levantan varias, habrá que mover el candado a la base de datos.
 *
 * Se eliminó la tarea que cada cinco minutos comparaba la lista de cursos en borrador con
 * una copia en memoria para adivinar cuáles se habían republicado: ese cambio lo conoce
 * `CursosService.updateCurso` en el instante en que ocurre y ya avisa desde allí.
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly enCurso = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificaciones: NotificacionesService,
    private readonly mail: MailService,
    private readonly storage: StorageService,
    private readonly certificados: CertificadosService,
  ) {}

  /** Ejecuta una tarea evitando solapes y registrando su resultado. */
  private async ejecutar(nombre: string, tarea: () => Promise<string | void>): Promise<void> {
    if (this.enCurso.has(nombre)) {
      this.logger.warn(`Se omite "${nombre}": la ejecución anterior sigue en curso.`);
      return;
    }

    this.enCurso.add(nombre);
    const inicio = Date.now();
    try {
      const resumen = await tarea();
      if (resumen) this.logger.log(`${nombre}: ${resumen} (${Date.now() - inicio} ms)`);
    } catch (error) {
      this.logger.error(`${nombre} falló`, error);
    } finally {
      this.enCurso.delete(nombre);
    }
  }

  // ── Recordatorios ────────────────────────────────────────────────────────

  /** Recuerda a los alumnos inactivos que tienen formación pendiente. Cada día a las 8:00. */
  @Cron('0 8 * * *')
  recordarInactividad(): Promise<void> {
    return this.ejecutar('recordatorio de inactividad', async () => {
      const corte = new Date(Date.now() - DIAS_INACTIVIDAD * 24 * 60 * 60 * 1000);

      const inactivos = await this.prisma.usuarios.findMany({
        where: {
          rol: 'ESTUDIANTE',
          activo: true,
          OR: [{ ultimo_acceso: { lt: corte } }, { ultimo_acceso: null }],
          // Sólo tiene sentido avisar a quien tiene formación asignada.
          matriculas: { some: { activa: true } },
          // Y sólo si no se le avisó ya en este mismo periodo.
          notificaciones: {
            none: { tipo: 'RECORDATORIO_INACTIVIDAD', created_at: { gt: corte } },
          },
        },
        select: { guid: true, email: true, nombre: true, pais: true, ultimo_acceso: true },
      });

      for (const alumno of inactivos) {
        const dias = alumno.ultimo_acceso
          ? Math.floor((Date.now() - alumno.ultimo_acceso.getTime()) / (24 * 60 * 60 * 1000))
          : DIAS_INACTIVIDAD;

        await this.notificaciones.crear({
          usuario_guid: alumno.guid,
          pais: alumno.pais,
          tipo: 'RECORDATORIO_INACTIVIDAD',
          titulo: 'Tienes formación pendiente',
          mensaje: `Llevas ${dias} día(s) sin entrar. Retoma tus cursos cuando puedas.`,
          url_accion: '/dashboard',
        });

        await this.mail.sendInactivityReminder(alumno.email, alumno.nombre, dias, alumno.pais);
      }

      return `${inactivos.length} recordatorio(s) enviados`;
    });
  }

  // ── Desbloqueo por espera ────────────────────────────────────────────────

  /**
   * Desbloquea el avance de quien lleva más de 48 h esperando una calificación.
   *
   * No da la tarea por aprobada: sólo crea el registro de progreso que permite pasar al
   * siguiente recurso. El certificado sigue exigiendo que todas las tareas estén
   * calificadas, así que nadie se certifica por esta vía.
   */
  @Cron('0 * * * *')
  desbloquearEsperasLargas(): Promise<void> {
    return this.ejecutar('desbloqueo por espera', async () => {
      const corte = new Date(Date.now() - HORAS_DESBLOQUEO_AUTOMATICO * 60 * 60 * 1000);

      const pendientes = await this.prisma.lms_entregas.findMany({
        where: {
          estado: { in: ['ENTREGADA', 'EN_REVISION'] },
          fecha_entrega: { lt: corte },
          tarea_guid: { not: null },
        },
        select: {
          usuario_guid: true,
          tarea_guid: true,
          usuario: { select: { pais: true } },
          tarea: { select: { titulo: true } },
        },
        take: 500,
      });
      if (pendientes.length === 0) return;

      let desbloqueados = 0;
      for (const entrega of pendientes) {
        if (!entrega.tarea_guid) continue;

        const yaDesbloqueado = await this.prisma.lms_progreso_recurso.findUnique({
          where: {
            usuario_guid_recurso_guid: {
              usuario_guid: entrega.usuario_guid,
              recurso_guid: entrega.tarea_guid,
            },
          },
          select: { id: true },
        });
        if (yaDesbloqueado) continue;

        await this.prisma.lms_progreso_recurso.create({
          data: { usuario_guid: entrega.usuario_guid, recurso_guid: entrega.tarea_guid, completado: true },
        });
        desbloqueados++;

        await this.notificaciones.crear({
          usuario_guid: entrega.usuario_guid,
          pais: entrega.usuario.pais,
          tipo: 'MODULO_COMPLETADO',
          titulo: 'Puedes continuar con el curso',
          mensaje:
            `Tu tarea "${entrega.tarea?.titulo ?? 'pendiente'}" lleva más de ${HORAS_DESBLOQUEO_AUTOMATICO} horas ` +
            'esperando calificación, así que hemos desbloqueado el siguiente recurso. La tarea sigue pendiente de revisión.',
          url_accion: '/dashboard/student/cursos',
        });
      }

      return `${desbloqueados} recurso(s) desbloqueados`;
    });
  }

  // ── Limpieza de almacenamiento ───────────────────────────────────────────

  /**
   * Borra los archivos que ya no referencia ninguna fila.
   *
   * La versión anterior comparaba los nombres planos del directorio contra las claves con
   * prefijo de carpeta guardadas en base de datos. No coincidía ninguna, así que borraba
   * **todos** los archivos locales con más de 24 horas, entregas y certificados incluidos.
   * Ahora ambos lados usan la misma clave `carpeta/nombre`.
   */
  @Cron('0 3 * * *')
  limpiarArchivosHuerfanos(): Promise<void> {
    return this.ejecutar('limpieza de archivos huérfanos', async () => {
      if (this.storage.usaAlmacenamientoRemoto) {
        // Con R2 el inventario remoto no se recorre desde aquí: listar un bucket completo
        // cada noche es caro y el borrado ya se hace en el momento de desvincular.
        return 'omitida (almacenamiento remoto)';
      }

      const referenciadas = await this.clavesReferenciadas();
      const locales = await this.storage.listarLocales();
      const corte = Date.now() - HORAS_GRACIA_HUERFANOS * 60 * 60 * 1000;

      let borrados = 0;
      for (const archivo of locales) {
        if (referenciadas.has(archivo.clave)) continue;
        // El margen evita borrar un archivo recién subido cuya fila aún no se ha escrito.
        if (archivo.modificado > corte) continue;

        await this.storage.deleteFile(archivo.clave);
        borrados++;
      }

      return `${borrados} archivo(s) huérfanos borrados de ${locales.length} revisados`;
    });
  }

  /** Todas las claves de almacenamiento que alguna fila sigue usando. */
  private async clavesReferenciadas(): Promise<Set<string>> {
    const [recursos, entregas, certificados, usuarios, cursos, configuraciones] = await Promise.all([
      this.prisma.lms_recursos.findMany({ select: { archivo_adjunto: true, url_archivo: true } }),
      this.prisma.lms_entregas.findMany({
        where: { url_archivo_adjunto: { not: null } },
        select: { url_archivo_adjunto: true },
      }),
      this.prisma.lms_certificados.findMany({ select: { archivo_pdf: true } }),
      this.prisma.usuarios.findMany({ select: { firma_url: true, foto_url: true } }),
      this.prisma.lms_cursos.findMany({ select: { imagen_portada: true } }),
      this.prisma.lms_configuracion.findMany({
        select: { logo_url: true, favicon_url: true, login_fondo_url: true },
      }),
    ]);

    const claves = new Set<string>();
    const anadir = (valor: string | null | undefined) => {
      if (valor) claves.add(valor);
    };

    for (const r of recursos) {
      anadir(r.archivo_adjunto);
      anadir(r.url_archivo);
    }
    for (const e of entregas) anadir(e.url_archivo_adjunto);
    for (const c of certificados) anadir(c.archivo_pdf);
    for (const u of usuarios) {
      anadir(u.firma_url);
      anadir(u.foto_url);
    }
    for (const c of cursos) anadir(c.imagen_portada);
    for (const c of configuraciones) {
      anadir(c.logo_url);
      anadir(c.favicon_url);
      anadir(c.login_fondo_url);
    }

    return claves;
  }

  /**
   * Retira los archivos de las entregas de quienes ya tienen certificado.
   * Recoge los casos en que la purga del momento de emitir falló. Domingos a las 4:00.
   */
  @Cron('0 4 * * 0')
  purgarEntregasCertificadas(): Promise<void> {
    return this.ejecutar('purga de entregas certificadas', async () => {
      const certificados = await this.prisma.lms_certificados.findMany({
        where: {
          usuario: {
            entregas: { some: { archivo_purgado: false, url_archivo_adjunto: { not: null } } },
          },
        },
        select: { usuario_guid: true, curso_guid: true },
        take: 200,
      });

      for (const certificado of certificados) {
        await this.certificados.purgarEntregas(certificado.curso_guid, certificado.usuario_guid);
      }

      return `${certificados.length} certificado(s) revisados`;
    });
  }

  // ── Limpieza de datos temporales ─────────────────────────────────────────

  /**
   * Borra códigos de verificación y enlaces de recuperación caducados.
   * Son secretos de un solo uso: conservarlos pasada su vigencia no aporta nada y alarga
   * innecesariamente la ventana en que podrían filtrarse.
   */
  @Cron('30 3 * * *')
  limpiarDatosTemporales(): Promise<void> {
    return this.ejecutar('limpieza de datos temporales', async () => {
      const ahora = new Date();
      const [verificaciones, recuperaciones] = await Promise.all([
        this.prisma.lms_verificacion_email.deleteMany({ where: { expires_at: { lt: ahora } } }),
        this.prisma.lms_password_resets.deleteMany({ where: { expires_at: { lt: ahora } } }),
      ]);

      return `${verificaciones.count} código(s) y ${recuperaciones.count} enlace(s) caducados borrados`;
    });
  }
}
