import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { ConfiguracionService } from '../configuracion/configuracion.service';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private fromAddress: string;
  private fromName: string;
  private appUrl: string;
  private enabled: boolean = false;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private configuracionService: ConfiguracionService,
  ) {
    this.fromAddress = this.configService.get<string>('SMTP_FROM') || 'noreply@lms.local';
    this.fromName = this.configService.get<string>('SMTP_FROM_NAME') || 'Campus Virtual';
    this.appUrl = this.configService.get<string>('APP_URL') || 'http://localhost:3100';
  }

  async onModuleInit() {
    const smtpHost = this.configService.get<string>('SMTP_HOST');
    const smtpPort = this.configService.get<string>('SMTP_PORT');
    const smtpUser = this.configService.get<string>('SMTP_USER');
    const smtpPass = this.configService.get<string>('SMTP_PASS');

    if (smtpHost && smtpUser && smtpPass) {
      // Production SMTP
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(smtpPort || '587', 10),
        secure: (smtpPort || '587') === '465',
        auth: { user: smtpUser, pass: smtpPass },
      });
      this.enabled = true;
      this.logger.log(`Mail service [PRODUCTION]: ${smtpHost}:${smtpPort}`);
    } else {
      // Development fallback: Ethereal (catches all emails, provides preview URL)
      try {
        const testAccount = await nodemailer.createTestAccount();
        this.transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: { user: testAccount.user, pass: testAccount.pass },
        });
        this.fromAddress = testAccount.user;
        this.enabled = true;
        this.logger.log(`Mail service [DEV/ETHEREAL]: ${testAccount.user}`);
        this.logger.log(
          `Preview emails at: https://ethereal.email/login (user: ${testAccount.user}, pass: ${testAccount.pass})`,
        );
      } catch (err) {
        this.logger.warn(
          'Mail service DISABLED — Could not create Ethereal account. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env for production.',
        );
      }
    }
  }

  // ─── API METHODS ─────────────────────────────────────────

  async getAllEventos() {
    return this.prisma.lms_eventos_correo.findMany({
      include: {
        plantillas: true,
      },
    });
  }

  async updateTemplate(id: number, dto: { asunto?: string; cuerpo_html?: string; activo?: boolean }) {
    return this.prisma.lms_plantillas_correo.update({
      where: { id },
      data: dto,
    });
  }

  /**
   * Send an email with retry logic. Returns silently if mail is not configured.
   * Retries up to 3 times with exponential backoff (1s, 2s, 4s).
   */
  async sendMail(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.enabled || !this.transporter) {
      this.logger.debug(`[MOCK] Email to ${to}: ${subject}`);
      return false;
    }

    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const info = await this.transporter.sendMail({
          from: `"${this.fromName}" <${this.fromAddress}>`,
          to,
          subject,
          html,
        });
        this.logger.log(`Email sent to ${to}: ${subject}`);
        // Show preview URL for Ethereal (dev mode)
        const previewUrl = nodemailer.getTestMessageUrl(info);
        if (previewUrl) {
          this.logger.debug(`Preview: ${previewUrl}`);
        }
        return true;
      } catch (err) {
        if (attempt < MAX_RETRIES) {
          const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
          this.logger.warn(`Email to ${to} failed (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          this.logger.error(`Email to ${to} FAILED after ${MAX_RETRIES} attempts: ${(err as Error)?.message || err}`);
        }
      }
    }
    return false;
  }

  // ─── TEMPLATE RENDERING ──────────────────────────────────

  private async renderTemplate(identificador: string, variables: Record<string, string | number>) {
    const evento = await this.prisma.lms_eventos_correo.findUnique({
      where: { identificador },
      include: { plantillas: { where: { activo: true } } },
    });

    if (!evento || evento.plantillas.length === 0) return null;

    const plantilla = evento.plantillas[0]; // take the first active
    let html = plantilla.cuerpo_html;
    let asunto = plantilla.asunto;

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      html = html.replace(regex, String(value));
      asunto = asunto.replace(regex, String(value));
    }

    return { html: await this.wrapTemplate(html), asunto };
  }

  // ─── TEMPLATE METHODS ────────────────────────────────────

  async sendPasswordResetEmail(email: string, token: string, nombre: string) {
    const resetUrl = `${this.appUrl}/restablecer-contrasena?token=${token}`;
    const rendered = await this.renderTemplate('RECUPERAR_PASSWORD', { nombre, resetUrl });
    if (!rendered) return false;
    return this.sendMail(email, rendered.asunto, rendered.html);
  }

  async sendGradeNotification(
    email: string,
    nombre: string,
    tarea: string,
    calificacion: number,
    notaAprobacion = 3.0,
  ) {
    const emoji = calificacion >= notaAprobacion ? '🎉' : '⚠️';
    const mensaje_aprobacion =
      calificacion < notaAprobacion
        ? '<p style="color:#ef4444;font-size:14px;font-weight:600">Debes subir un nuevo documento para mejorar tu nota.</p>'
        : '<p style="color:#10b981;font-size:14px;font-weight:600">¡Buen trabajo! Sigue así.</p>';
    const rendered = await this.renderTemplate('CALIFICACION_RECIBIDA', {
      nombre,
      tarea,
      calificacion,
      emoji,
      mensaje_aprobacion,
      url_campus: `${this.appUrl}/dashboard`,
    });
    if (!rendered) return false;
    return this.sendMail(email, rendered.asunto, rendered.html);
  }

  async sendInactivityReminder(email: string, nombre: string, diasInactivo: number) {
    const rendered = await this.renderTemplate('RECORDATORIO_INACTIVIDAD', {
      nombre,
      diasInactivo,
      url_campus: `${this.appUrl}/dashboard`,
    });
    if (!rendered) return false;
    return this.sendMail(email, rendered.asunto, rendered.html);
  }

  async sendCourseReactivated(email: string, nombre: string, cursoTitulo: string) {
    const rendered = await this.renderTemplate('CURSO_REACTIVADO', {
      nombre,
      cursoTitulo,
      url_campus: `${this.appUrl}/dashboard`,
    });
    if (!rendered) return false;
    return this.sendMail(email, rendered.asunto, rendered.html);
  }

  async sendNewAccessRequest(
    adminEmail: string,
    adminNombre: string,
    solicitante: { nombre: string; apellido: string; email: string; rol_pedido: string },
  ) {
    const rolLabel =
      solicitante.rol_pedido === 'ESTUDIANTE'
        ? 'Capacitante'
        : solicitante.rol_pedido === 'PROFESOR'
          ? 'Examinador'
          : 'Administrador';
    const solicitanteNombre = `${solicitante.nombre} ${solicitante.apellido}`;
    const rendered = await this.renderTemplate('NUEVA_SOLICITUD_ACCESO', {
      adminNombre,
      solicitanteNombre,
      solicitanteEmail: solicitante.email,
      solicitanteRol: rolLabel,
      url_solicitudes: `${this.appUrl}/dashboard/admin/solicitudes`,
    });
    if (!rendered) return false;
    return this.sendMail(adminEmail, rendered.asunto, rendered.html);
  }

  async sendNewSubmissionNotification(
    examinerEmail: string,
    examinerNombre: string,
    estudiante: string,
    tarea: string,
    curso: string,
  ) {
    const rendered = await this.renderTemplate('NUEVA_ENTREGA', {
      examinerNombre,
      estudiante,
      tarea,
      curso,
      url_calificaciones: `${this.appUrl}/dashboard/examiner/calificaciones`,
    });
    if (!rendered) return false;
    return this.sendMail(examinerEmail, rendered.asunto, rendered.html);
  }

  async sendQuizFailedModuleReset(
    email: string,
    nombre: string,
    quizTitulo: string,
    moduloTitulo: string,
    nota: number,
  ) {
    const rendered = await this.renderTemplate('MODULO_REINICIADO', {
      nombre,
      quizTitulo,
      moduloTitulo,
      nota,
      url_campus: `${this.appUrl}/dashboard`,
    });
    if (!rendered) return false;
    return this.sendMail(email, rendered.asunto, rendered.html);
  }

  /**
   * BUG-08 FIX: Send welcome email to newly approved users with their temp password.
   */
  async sendWelcomeEmail(email: string, nombre: string, tempPassword: string) {
    // Try template system first (USUARIO_APROBADO)
    const rendered = await this.renderTemplate('USUARIO_APROBADO', {
      nombre,
      email,
      tempPassword,
      url_campus: this.appUrl,
    });

    if (rendered) {
      return this.sendMail(email, rendered.asunto, rendered.html);
    }

    // Fallback: hardcoded template if USUARIO_APROBADO event not seeded yet
    const subject = '🎓 ¡Bienvenido al Campus Virtual!';
    const fallbackHtml = await this.wrapTemplate(`
      <h2 style="color:#1e293b;margin:0 0 16px">¡Hola ${nombre}! 👋</h2>
      <p style="color:#64748b;font-size:15px;line-height:1.6">Tu solicitud de acceso ha sido <strong style="color:#10b981">aprobada</strong>.</p>
      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:20px;margin:20px 0">
        <p style="margin:4px 0"><strong>📧 Email:</strong> ${email}</p>
        <p style="margin:4px 0"><strong>🔑 Contraseña temporal:</strong> <code style="background:#e2e8f0;padding:2px 8px;border-radius:4px">${tempPassword}</code></p>
      </div>
      <p style="color:#ef4444;font-weight:600">⚠️ Deberás cambiar tu contraseña en el primer inicio de sesión.</p>
      <div style="text-align:center;margin:32px 0">
        <a href="${this.appUrl}" style="display:inline-block;background:#4f46e5;color:#fff;font-weight:700;padding:14px 36px;border-radius:12px;text-decoration:none;font-size:15px">Ir al Campus Virtual</a>
      </div>
    `);
    return this.sendMail(email, subject, fallbackHtml);
  }

  /**
   * Notify enrolled students when a course enters maintenance (BORRADOR state).
   */
  async sendCourseMaintenanceNotification(email: string, nombre: string, cursoTitulo: string) {
    const rendered = await this.renderTemplate('CURSO_MANTENIMIENTO', {
      nombre,
      cursoTitulo,
      url_campus: `${this.appUrl}/dashboard`,
    });
    if (!rendered) return false;
    return this.sendMail(email, rendered.asunto, rendered.html);
  }

  /**
   * Notify a student when they are enrolled in a new course.
   */
  async sendEnrollmentNotification(email: string, nombre: string, cursoTitulo: string, cursoGuid: string) {
    const rendered = await this.renderTemplate('MATRICULA_NUEVA', {
      nombre,
      cursoTitulo,
      url_curso: `${this.appUrl}/cursos/${cursoGuid}`,
    });
    if (!rendered) return false;
    return this.sendMail(email, rendered.asunto, rendered.html);
  }

  /**
   * Notify a student when their certificate is generated.
   */
  async sendCertificateGenerated(email: string, nombre: string, cursoTitulo: string, codigo: string, certGuid: string) {
    const rendered = await this.renderTemplate('CERTIFICADO_GENERADO', {
      nombre,
      cursoTitulo,
      codigo,
      url_certificado: `${this.appUrl}/dashboard/student/certificados`,
    });
    if (!rendered) return false;
    return this.sendMail(email, rendered.asunto, rendered.html);
  }

  /**
   * Notify a student when their submission is rejected (below passing grade).
   */
  async sendSubmissionRejected(
    email: string,
    nombre: string,
    tarea: string,
    calificacion: number,
    comentario?: string,
  ) {
    const comentarioHtml = comentario
      ? `<div style="background:#f1f5f9;border-radius:12px;padding:16px;margin:16px 0"><p style="color:#64748b;font-size:13px;margin:0"><strong>Comentario del examinador:</strong> ${comentario}</p></div>`
      : '';
    const rendered = await this.renderTemplate('ENTREGA_RECHAZADA', {
      nombre,
      tarea,
      calificacion,
      comentario: comentarioHtml,
      url_campus: `${this.appUrl}/dashboard`,
    });
    if (!rendered) return false;
    return this.sendMail(email, rendered.asunto, rendered.html);
  }

  /**
   * Notify the examiner when a student completes all course requirements.
   */
  async sendCourseCompletedNotification(
    email: string,
    examinerNombre: string,
    estudiante: string,
    cursoTitulo: string,
  ) {
    const rendered = await this.renderTemplate('CURSO_COMPLETADO', {
      examinerNombre,
      estudiante,
      cursoTitulo,
      url_monitoreo: `${this.appUrl}/dashboard/examiner/monitoreo`,
    });
    if (!rendered) return false;
    return this.sendMail(email, rendered.asunto, rendered.html);
  }

  /**
   * Wrap content in a styled email template dynamically using DB config.
   */
  private async wrapTemplate(content: string): Promise<string> {
    const config = await this.configuracionService.getConfig();
    const colorPrimario = config?.color_primario || '#4f46e5';
    const titulo = config?.nombre_plataforma || 'Campus Virtual';
    const logoHtml = config?.logo_url
      ? `<img src="${config.logo_url}" alt="${titulo}" style="max-height:40px;vertical-align:middle" />`
      : `<h1 style="color:#ffffff;font-size:18px;margin:0;font-weight:700">${titulo}</h1>`;

    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f8fafc">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06)">
    <div style="background:${colorPrimario};padding:28px 32px">
      ${logoHtml}
    </div>
    <div style="padding:32px">
      ${content}
    </div>
    <div style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center">
      <p style="color:#94a3b8;font-size:12px;margin:0">Este es un correo automático de ${titulo}, por favor no respondas directamente.</p>
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Send a 6-digit email verification code for access requests.
   */
  async sendEmailVerificationCode(email: string, codigo: string) {
    const content = `
      <h2 style="color:#1e293b;font-size:20px;margin:0 0 12px">Verificación de Correo Electrónico</h2>
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px">
        Has solicitado verificar tu correo electrónico para crear una solicitud de acceso a la plataforma.
        Ingresa el siguiente código en la página de solicitud:
      </p>
      <div style="background:#f1f5f9;border-radius:12px;padding:24px;text-align:center;margin:0 0 20px">
        <span style="font-size:36px;font-weight:800;letter-spacing:8px;color:#1e293b;font-family:monospace">${codigo}</span>
      </div>
      <p style="color:#94a3b8;font-size:12px;margin:0">
        Este código expira en <strong>10 minutos</strong>. Si no solicitaste esta verificación, puedes ignorar este correo.
      </p>
    `;
    const html = await this.wrapTemplate(content);
    await this.sendMail(email, 'Código de Verificación — Campus Virtual', html);
  }
}
