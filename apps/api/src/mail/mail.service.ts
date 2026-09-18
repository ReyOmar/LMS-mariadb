import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { StorageService } from '../storage/storage.service';
import { PAIS_POR_DEFECTO, Pais } from '../common/domain/pais';
import { formatearNota, formatearPuntos } from '../common/domain/calificacion';
import { RolUsuario } from '../common/interfaces/jwt-payload.interface';
import { UpdateTemplateDto } from './dto/update-template.dto';

/** Reintentos ante un fallo puntual del proveedor de correo. */
const MAX_REINTENTOS = 3;

/** Nombre visible de cada rol en los correos, en el vocabulario del negocio. */
const ETIQUETA_ROL: Record<RolUsuario, string> = {
  ESTUDIANTE: 'Capacitante',
  PROFESOR: 'Examinador',
  ADMINISTRADOR: 'Administrador',
};

/**
 * Envío de correo transaccional.
 *
 * Dos vías, por orden de preferencia:
 *  1. API HTTP de Brevo (puerto 443), que funciona en alojamientos donde los puertos SMTP
 *     están cerrados —el caso habitual en cPanel compartido—.
 *  2. SMTP clásico.
 *
 * Si no hay ninguna configurada, los envíos se registran y se descartan: el sistema sigue
 * funcionando sin correo, pero deja constancia en el registro de lo que no pudo enviar.
 *
 * Las plantillas se guardan en base de datos y son editables desde el panel. La marca del
 * correo (logotipo, color, nombre) sale de la configuración **de la sede del
 * destinatario**, por eso todos los métodos reciben el país.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporte: nodemailer.Transporter | null = null;
  private claveBrevo: string | null = null;
  private activo = false;

  private readonly remitente: string;
  private readonly nombreRemitente: string;
  private readonly urlApp: string;
  private readonly urlApi: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly configuracion: ConfiguracionService,
    private readonly storage: StorageService,
  ) {
    this.remitente = this.config.get<string>('SMTP_FROM') ?? 'noreply@lms.local';
    this.nombreRemitente = this.config.get<string>('SMTP_FROM_NAME') ?? 'Campus Virtual';
    this.urlApp = (this.config.get<string>('APP_URL') ?? 'http://localhost:3100').replace(/\/+$/, '');
    // Los correos necesitan URLs absolutas: una clave de almacenamiento relativa se ve
    // como una imagen rota en el cliente de correo.
    this.urlApi = (this.config.get<string>('API_PUBLIC_URL') ?? 'http://localhost:3200').replace(/\/+$/, '');
  }

  async onModuleInit(): Promise<void> {
    const claveBrevo = this.config.get<string>('BREVO_API_KEY');
    if (claveBrevo) {
      this.claveBrevo = claveBrevo;
      this.activo = true;
      this.logger.log('Correo activo mediante la API HTTP de Brevo');
      return;
    }

    const host = this.config.get<string>('SMTP_HOST');
    const usuario = this.config.get<string>('SMTP_USER');
    const clave = this.config.get<string>('SMTP_PASS');
    const puerto = Number(this.config.get<string>('SMTP_PORT') ?? 587);

    if (host && usuario && clave) {
      this.transporte = nodemailer.createTransport({
        host,
        port: puerto,
        secure: puerto === 465,
        auth: { user: usuario, pass: clave },
      });
      this.activo = true;
      this.logger.log(`Correo activo mediante SMTP en ${host}:${puerto}`);
      return;
    }

    this.logger.warn(
      'Correo DESACTIVADO: define BREVO_API_KEY (recomendado en cPanel) o SMTP_HOST/SMTP_USER/SMTP_PASS. ' +
        'La aplicación funciona, pero no saldrá ningún correo.',
    );
  }

  // ── Envío ────────────────────────────────────────────────────────────────

  /**
   * Envía un correo con reintentos y espera creciente.
   * Nunca lanza: un fallo de correo no debe deshacer la operación que lo originó.
   */
  async sendMail(destinatario: string, asunto: string, html: string): Promise<boolean> {
    if (!this.activo) {
      this.logger.debug(`Correo no enviado (servicio desactivado) → ${destinatario}: ${asunto}`);
      return false;
    }

    for (let intento = 1; intento <= MAX_REINTENTOS; intento++) {
      try {
        if (this.claveBrevo) {
          await this.enviarPorBrevo(destinatario, asunto, html);
        } else if (this.transporte) {
          await this.transporte.sendMail({
            from: `"${this.nombreRemitente}" <${this.remitente}>`,
            to: destinatario,
            subject: asunto,
            html,
          });
        }
        this.logger.log(`Correo enviado a ${destinatario}: ${asunto}`);
        return true;
      } catch (error) {
        const ultimo = intento === MAX_REINTENTOS;
        if (ultimo) {
          this.logger.error(
            `Correo a ${destinatario} fallido tras ${MAX_REINTENTOS} intentos: ${(error as Error)?.message}`,
          );
          return false;
        }
        await this.esperar(2 ** (intento - 1) * 1000);
      }
    }
    return false;
  }

  private async enviarPorBrevo(destinatario: string, asunto: string, html: string): Promise<void> {
    const respuesta = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': this.claveBrevo!,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: this.nombreRemitente, email: this.remitente },
        to: [{ email: destinatario }],
        subject: asunto,
        htmlContent: html,
      }),
    });

    if (!respuesta.ok) {
      throw new Error(`Brevo respondió ${respuesta.status}: ${await respuesta.text()}`);
    }
  }

  private esperar(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ── Plantillas ───────────────────────────────────────────────────────────

  /** Plantillas editables desde el panel de administración. */
  getEventos() {
    return this.prisma.lms_eventos_correo.findMany({
      include: { plantillas: true },
      orderBy: { identificador: 'asc' },
    });
  }

  actualizarPlantilla(id: number, dto: UpdateTemplateDto) {
    return this.prisma.lms_plantillas_correo.update({ where: { id }, data: dto });
  }

  /**
   * Resuelve una plantilla sustituyendo sus variables.
   * Devuelve `null` si el evento no existe o no tiene ninguna plantilla activa, y quien
   * llama decide si eso es un fallo o simplemente un aviso que no se envía.
   */
  private async renderizar(
    identificador: string,
    variables: Record<string, string | number>,
    pais: Pais,
  ): Promise<{ asunto: string; html: string } | null> {
    const evento = await this.prisma.lms_eventos_correo.findUnique({
      where: { identificador },
      include: { plantillas: { where: { activo: true }, take: 1 } },
    });

    const plantilla = evento?.plantillas[0];
    if (!plantilla) {
      this.logger.warn(`No hay plantilla activa para el evento de correo "${identificador}"`);
      return null;
    }

    let html = plantilla.cuerpo_html;
    let asunto = plantilla.asunto;
    for (const [clave, valor] of Object.entries(variables)) {
      const marcador = new RegExp(`{{\\s*${clave}\\s*}}`, 'g');
      html = html.replace(marcador, String(valor));
      asunto = asunto.replace(marcador, String(valor));
    }

    return { asunto, html: await this.envolver(html, pais) };
  }

  /** Aplica la cabecera, el pie y los colores de la sede al cuerpo del correo. */
  private async envolver(contenido: string, pais: Pais): Promise<string> {
    const config = await this.configuracion.getConfig(pais);
    const titulo = config.nombre_plataforma;
    const color = config.color_primario;

    const logo = config.logo_url
      ? `<img src="${this.urlApi}${this.storage.urlDeDescarga(config.logo_url)}" alt="${titulo}" style="max-height:40px;vertical-align:middle" />`
      : `<h1 style="color:#ffffff;font-size:18px;margin:0;font-weight:700">${titulo}</h1>`;

    return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f8fafc">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06)">
    <div style="background:${color};padding:28px 32px">${logo}</div>
    <div style="padding:32px">${contenido}</div>
    <div style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center">
      <p style="color:#94a3b8;font-size:12px;margin:0">Correo automático de ${titulo}. No respondas a este mensaje.</p>
    </div>
  </div>
</body>
</html>`;
  }

  private async enviarPlantilla(
    identificador: string,
    destinatario: string,
    variables: Record<string, string | number>,
    pais: Pais,
  ): Promise<boolean> {
    const plantilla = await this.renderizar(identificador, variables, pais);
    if (!plantilla) return false;
    return this.sendMail(destinatario, plantilla.asunto, plantilla.html);
  }

  // ── Correos del sistema ──────────────────────────────────────────────────

  sendPasswordResetEmail(email: string, token: string, nombre: string, pais: Pais) {
    return this.enviarPlantilla(
      'RECUPERAR_PASSWORD',
      email,
      { nombre, resetUrl: `${this.urlApp}/restablecer-contrasena?token=${token}` },
      pais,
    );
  }

  sendNewAccessRequest(
    adminEmail: string,
    adminNombre: string,
    solicitante: { nombre: string; apellido: string; email: string; rol_pedido: RolUsuario; pais: Pais },
  ) {
    return this.enviarPlantilla(
      'NUEVA_SOLICITUD_ACCESO',
      adminEmail,
      {
        adminNombre,
        solicitanteNombre: `${solicitante.nombre} ${solicitante.apellido}`,
        solicitanteEmail: solicitante.email,
        solicitanteRol: ETIQUETA_ROL[solicitante.rol_pedido],
        url_solicitudes: `${this.urlApp}/dashboard/admin/solicitudes`,
      },
      solicitante.pais,
    );
  }

  async sendWelcomeEmail(email: string, nombre: string, claveTemporal: string, pais: Pais) {
    const enviado = await this.enviarPlantilla(
      'USUARIO_APROBADO',
      email,
      { nombre, email, tempPassword: claveTemporal, url_campus: this.urlApp },
      pais,
    );
    if (enviado) return true;

    // Sin plantilla configurada la cuenta quedaría creada y el usuario sin conocer su
    // clave temporal, así que este correo tiene respaldo propio.
    const html = await this.envolver(
      `<h2 style="color:#1e293b;margin:0 0 16px">¡Hola ${nombre}!</h2>
       <p style="color:#64748b;font-size:15px;line-height:1.6">Tu solicitud de acceso ha sido <strong style="color:#10b981">aprobada</strong>.</p>
       <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:20px;margin:20px 0">
         <p style="margin:4px 0"><strong>Correo:</strong> ${email}</p>
         <p style="margin:4px 0"><strong>Contraseña temporal:</strong> <code style="background:#e2e8f0;padding:2px 8px;border-radius:4px">${claveTemporal}</code></p>
       </div>
       <p style="color:#ef4444;font-weight:600">Deberás crear tu propia contraseña la primera vez que entres.</p>
       <div style="text-align:center;margin:32px 0">
         <a href="${this.urlApp}/login" style="display:inline-block;background:#4f46e5;color:#fff;font-weight:700;padding:14px 36px;border-radius:12px;text-decoration:none;font-size:15px">Entrar al campus</a>
       </div>`,
      pais,
    );
    return this.sendMail(email, 'Tu acceso al campus virtual está listo', html);
  }

  /** Aviso de calificación. La nota se formatea siempre con la escala del sistema. */
  sendGradeNotification(
    email: string,
    nombre: string,
    tarea: string,
    calificacion: number,
    notaAprobacion: number,
    pais: Pais,
  ) {
    const aprobada = calificacion >= notaAprobacion;
    return this.enviarPlantilla(
      'CALIFICACION_RECIBIDA',
      email,
      {
        nombre,
        tarea,
        calificacion: formatearNota(calificacion),
        emoji: aprobada ? '🎉' : '⚠️',
        mensaje_aprobacion: aprobada
          ? '<p style="color:#10b981;font-size:14px;font-weight:600">¡Buen trabajo! Sigue así.</p>'
          : `<p style="color:#ef4444;font-size:14px;font-weight:600">Necesitas al menos ${formatearPuntos(notaAprobacion)} puntos. Puedes subir una nueva versión de tu entrega.</p>`,
        url_campus: `${this.urlApp}/dashboard`,
      },
      pais,
    );
  }

  sendSubmissionRejected(
    email: string,
    nombre: string,
    tarea: string,
    calificacion: number,
    pais: Pais,
    comentario?: string | null,
  ) {
    const bloqueComentario = comentario
      ? `<div style="background:#f1f5f9;border-radius:12px;padding:16px;margin:16px 0"><p style="color:#64748b;font-size:13px;margin:0"><strong>Comentario del examinador:</strong> ${comentario}</p></div>`
      : '';
    return this.enviarPlantilla(
      'ENTREGA_RECHAZADA',
      email,
      {
        nombre,
        tarea,
        calificacion: formatearNota(calificacion),
        comentario: bloqueComentario,
        url_campus: `${this.urlApp}/dashboard`,
      },
      pais,
    );
  }

  sendNewSubmissionNotification(
    examinadorEmail: string,
    examinadorNombre: string,
    estudiante: string,
    tarea: string,
    curso: string,
    pais: Pais,
  ) {
    return this.enviarPlantilla(
      'NUEVA_ENTREGA',
      examinadorEmail,
      {
        examinerNombre: examinadorNombre,
        estudiante,
        tarea,
        curso,
        url_calificaciones: `${this.urlApp}/dashboard/examiner/calificaciones`,
      },
      pais,
    );
  }

  sendQuizFailedModuleReset(
    email: string,
    nombre: string,
    quizTitulo: string,
    moduloTitulo: string,
    nota: number,
    pais: Pais,
  ) {
    return this.enviarPlantilla(
      'MODULO_REINICIADO',
      email,
      { nombre, quizTitulo, moduloTitulo, nota: formatearNota(nota), url_campus: `${this.urlApp}/dashboard` },
      pais,
    );
  }

  sendCourseMaintenanceNotification(email: string, nombre: string, cursoTitulo: string, pais: Pais) {
    return this.enviarPlantilla(
      'CURSO_MANTENIMIENTO',
      email,
      { nombre, cursoTitulo, url_campus: `${this.urlApp}/dashboard` },
      pais,
    );
  }

  sendCourseReactivated(email: string, nombre: string, cursoTitulo: string, pais: Pais) {
    return this.enviarPlantilla(
      'CURSO_REACTIVADO',
      email,
      { nombre, cursoTitulo, url_campus: `${this.urlApp}/dashboard` },
      pais,
    );
  }

  sendEnrollmentNotification(email: string, nombre: string, cursoTitulo: string, cursoGuid: string, pais: Pais) {
    return this.enviarPlantilla(
      'MATRICULA_NUEVA',
      email,
      { nombre, cursoTitulo, url_curso: `${this.urlApp}/cursos/${cursoGuid}` },
      pais,
    );
  }

  sendCertificateGenerated(email: string, nombre: string, cursoTitulo: string, codigo: string, pais: Pais) {
    return this.enviarPlantilla(
      'CERTIFICADO_GENERADO',
      email,
      { nombre, cursoTitulo, codigo, url_certificado: `${this.urlApp}/dashboard/student/certificados` },
      pais,
    );
  }

  sendCourseCompletedNotification(
    email: string,
    examinadorNombre: string,
    estudiante: string,
    cursoTitulo: string,
    pais: Pais,
  ) {
    return this.enviarPlantilla(
      'CURSO_COMPLETADO',
      email,
      {
        examinerNombre: examinadorNombre,
        estudiante,
        cursoTitulo,
        url_monitoreo: `${this.urlApp}/dashboard/examiner/monitoreo`,
      },
      pais,
    );
  }

  sendInactivityReminder(email: string, nombre: string, diasInactivo: number, pais: Pais) {
    return this.enviarPlantilla(
      'RECORDATORIO_INACTIVIDAD',
      email,
      { nombre, diasInactivo, url_campus: `${this.urlApp}/dashboard` },
      pais,
    );
  }

  /**
   * Código de verificación de correo.
   * Se envía antes de que exista cuenta, así que no hay sede de la que tomar la marca: se
   * usa la de la sede indicada o, en su defecto, la principal.
   */
  async sendEmailVerificationCode(email: string, codigo: string, pais: Pais = PAIS_POR_DEFECTO): Promise<boolean> {
    const html = await this.envolver(
      `<h2 style="color:#1e293b;font-size:20px;margin:0 0 12px">Verificación de correo electrónico</h2>
       <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px">
         Escribe este código en la página de solicitud de acceso para confirmar que este correo es tuyo:
       </p>
       <div style="background:#f1f5f9;border-radius:12px;padding:24px;text-align:center;margin:0 0 20px">
         <span style="font-size:36px;font-weight:800;letter-spacing:8px;color:#1e293b;font-family:monospace">${codigo}</span>
       </div>
       <p style="color:#94a3b8;font-size:12px;margin:0">
         El código caduca en <strong>10 minutos</strong>. Si no has solicitado acceso, puedes ignorar este correo.
       </p>`,
      pais,
    );
    return this.sendMail(email, 'Tu código de verificación', html);
  }
}
