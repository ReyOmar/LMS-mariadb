import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Country, countryName } from '../common/domain/country';
import { formatScore } from '../common/domain/grading';
import { campusUrl } from '../common/http/campus-url';
import { UserRole } from '../common/interfaces/jwt-payload.interface';
import { escapeHtml, MailTemplates } from './mail-templates';
import { MailTransport } from './mail-transport';

/**
 * Recuadro con el comentario del examinador, o nada si no dejó ninguno. El comentario lo
 * escribe una persona: se escapa antes de entrar en el marcado.
 */
function feedbackBlock(feedback?: string | null): string {
  return feedback?.trim()
    ? `<div style="background:#f1f5f9;border-radius:12px;padding:16px;margin:16px 0"><p style="color:#64748b;font-size:13px;margin:0;white-space:pre-line"><strong>Comentario del examinador:</strong> ${escapeHtml(feedback.trim())}</p></div>`
    : '';
}

/** Nombre visible de cada rol en los correos, en el vocabulario del negocio. */
const ROLE_LABELS: Record<UserRole, string> = {
  STUDENT: 'Estudiante',
  TEACHER: 'Examinador',
  ADMIN: 'Administrador',
};

/**
 * Los correos del campus, cada uno con su plantilla y sus datos.
 *
 * La plantilla y la marca del correo (logotipo, color, nombre) salen **de la sede del
 * destinatario**, por eso todos los métodos reciben el país.
 */
@Injectable()
export class MailService {
  private readonly appUrl: string;

  constructor(
    config: ConfigService,
    private readonly templates: MailTemplates,
    private readonly transport: MailTransport,
  ) {
    this.appUrl = campusUrl(config);
  }

  /** Si hay un proveedor con el que enviar: sin él, el campus funciona pero no sale ningún correo. */
  get isConfigured(): boolean {
    return this.transport.isConfigured;
  }

  /** Envía el correo de un evento con su plantilla; sin plantilla activa, el aviso no se envía. */
  private async sendTemplate(
    key: string,
    recipient: string,
    variables: Record<string, string | number>,
    country: Country,
  ): Promise<void> {
    const template = await this.templates.render(key, variables, country);
    if (template) await this.transport.deliver(recipient, template.subject, template.html);
  }

  sendPasswordReset(email: string, token: string, name: string, country: Country) {
    return this.sendTemplate(
      'RECUPERAR_PASSWORD',
      email,
      { nombre: name, resetUrl: `${this.appUrl}/reset-password?token=${token}` },
      country,
    );
  }

  sendAccessRequest(
    adminEmail: string,
    adminName: string,
    requester: { firstName: string; lastName: string; email: string; requestedRole: UserRole; country: Country },
  ) {
    return this.sendTemplate(
      'NUEVA_SOLICITUD_ACCESO',
      adminEmail,
      {
        adminNombre: adminName,
        solicitanteNombre: `${requester.firstName} ${requester.lastName}`,
        solicitanteEmail: requester.email,
        solicitanteRol: ROLE_LABELS[requester.requestedRole],
        url_solicitudes: `${this.appUrl}/dashboard/admin/access-requests`,
      },
      requester.country,
    );
  }

  /**
   * Aviso a un administrador de que alguien espera por una infracción cuyo curso todavía no se
   * puede ofrecer: no se ha elegido, no está publicado o no tiene plaza.
   */
  sendEnrollmentWaiting(
    adminEmail: string,
    adminName: string,
    waiting: { infraction: string; people: string; reason: string; fix: string },
    country: Country,
  ) {
    return this.sendTemplate(
      'MATRICULA_EN_ESPERA',
      adminEmail,
      {
        adminNombre: adminName,
        infraccion: waiting.infraction,
        personas: waiting.people,
        causa: waiting.reason,
        solucion: waiting.fix,
        url_integraciones: `${this.appUrl}/dashboard/admin/integrations`,
      },
      country,
    );
  }

  /**
   * Bienvenida con la contraseña temporal, tanto al aprobar una solicitud como al dar de
   * alta una cuenta desde el panel. El enlace abre el acceso con la sede ya elegida: la
   * cuenta sólo puede entrar por la suya.
   */
  async sendWelcome(email: string, name: string, temporaryPassword: string, country: Country): Promise<void> {
    const loginUrl = `${this.appUrl}/login?sede=${country}`;
    const site = countryName(country);
    const template = await this.templates.render(
      'USUARIO_APROBADO',
      { nombre: name, email, tempPassword: temporaryPassword, sede: site, url_campus: loginUrl },
      country,
    );
    if (template) {
      await this.transport.deliver(email, template.subject, template.html);
      return;
    }

    // Sin plantilla configurada la cuenta quedaría creada y el usuario sin conocer su
    // clave temporal, así que este correo tiene respaldo propio. Sólo para eso: si lo que
    // falla es el envío, repetirlo con otro texto no lo arregla y podría llegar dos veces.
    const html = await this.templates.wrap(
      `<h2 style="color:#1e293b;margin:0 0 16px">¡Hola ${escapeHtml(name)}!</h2>
       <p style="color:#64748b;font-size:15px;line-height:1.6">Tu cuenta en el campus de <strong>${escapeHtml(site)}</strong> está lista.</p>
       <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:20px;margin:20px 0">
         <p style="margin:4px 0"><strong>Sede:</strong> ${escapeHtml(site)}</p>
         <p style="margin:4px 0"><strong>Correo:</strong> ${escapeHtml(email)}</p>
         <p style="margin:4px 0"><strong>Contraseña temporal:</strong> <code style="background:#e2e8f0;padding:2px 8px;border-radius:4px">${escapeHtml(temporaryPassword)}</code></p>
       </div>
       <p style="color:#ef4444;font-weight:600">Deberás crear tu propia contraseña la primera vez que entres.</p>
       <div style="text-align:center;margin:32px 0">
         <a href="${loginUrl}" style="display:inline-block;background:#4f46e5;color:#fff;font-weight:700;padding:14px 36px;border-radius:12px;text-decoration:none;font-size:15px">Entrar al campus</a>
       </div>`,
      country,
    );
    await this.transport.deliver(email, 'Tu acceso al campus virtual está listo', html);
  }

  /** Aviso a quien pidió acceso de que su solicitud no se aprobó, con el motivo si lo hay. */
  sendAccessRequestRejected(email: string, name: string, reason: string | null, country: Country) {
    // El motivo lo escribe el administrador: se escapa antes de entrar en el marcado.
    const reasonBlock = reason
      ? `<div style="background:#f1f5f9;border-radius:12px;padding:16px;margin:16px 0"><p style="color:#64748b;font-size:13px;margin:0"><strong>Motivo:</strong> ${escapeHtml(reason)}</p></div>`
      : '';
    return this.sendTemplate(
      'SOLICITUD_RECHAZADA',
      email,
      { nombre: name, sede: countryName(country), motivo: reasonBlock },
      country,
    );
  }

  /**
   * Aviso de una tarea aprobada, con el comentario del examinador si lo dejó; la suspendida
   * tiene el suyo (`sendSubmissionRejected`). La nota se formatea con la escala del sistema.
   */
  sendGrade(
    email: string,
    name: string,
    assignment: string,
    score: number,
    country: Country,
    feedback?: string | null,
  ) {
    return this.sendTemplate(
      'CALIFICACION_RECIBIDA',
      email,
      {
        nombre: name,
        tarea: assignment,
        calificacion: formatScore(score, country),
        emoji: '🎉',
        mensaje_aprobacion: '<p style="color:#10b981;font-size:14px;font-weight:600">¡Buen trabajo! Sigue así.</p>',
        comentario: feedbackBlock(feedback),
        url_campus: `${this.appUrl}/dashboard`,
      },
      country,
    );
  }

  sendSubmissionRejected(
    email: string,
    name: string,
    assignment: string,
    score: number,
    country: Country,
    feedback?: string | null,
  ) {
    return this.sendTemplate(
      'ENTREGA_RECHAZADA',
      email,
      {
        nombre: name,
        tarea: assignment,
        calificacion: formatScore(score, country),
        comentario: feedbackBlock(feedback),
        url_campus: `${this.appUrl}/dashboard`,
      },
      country,
    );
  }

  sendNewSubmission(
    examinerEmail: string,
    examinerName: string,
    student: string,
    assignment: string,
    course: string,
    country: Country,
  ) {
    return this.sendTemplate(
      'NUEVA_ENTREGA',
      examinerEmail,
      {
        examinerNombre: examinerName,
        estudiante: student,
        tarea: assignment,
        curso: course,
        url_calificaciones: `${this.appUrl}/dashboard/examiner/grading`,
      },
      country,
    );
  }

  sendQuizFailed(email: string, name: string, quizTitle: string, moduleTitle: string, score: number, country: Country) {
    return this.sendTemplate(
      'MODULO_REINICIADO',
      email,
      {
        nombre: name,
        quizTitulo: quizTitle,
        moduloTitulo: moduleTitle,
        nota: formatScore(score, country),
        url_campus: `${this.appUrl}/dashboard`,
      },
      country,
    );
  }

  sendCourseUnderMaintenance(email: string, name: string, courseTitle: string, country: Country) {
    return this.sendTemplate(
      'CURSO_MANTENIMIENTO',
      email,
      { nombre: name, cursoTitulo: courseTitle, url_campus: `${this.appUrl}/dashboard` },
      country,
    );
  }

  sendCourseReactivated(email: string, name: string, courseTitle: string, country: Country) {
    return this.sendTemplate(
      'CURSO_REACTIVADO',
      email,
      { nombre: name, cursoTitulo: courseTitle, url_campus: `${this.appUrl}/dashboard` },
      country,
    );
  }

  sendEnrollment(email: string, name: string, courseTitle: string, courseGuid: string, country: Country) {
    return this.sendTemplate(
      'MATRICULA_NUEVA',
      email,
      { nombre: name, cursoTitulo: courseTitle, url_curso: `${this.appUrl}/courses/${courseGuid}` },
      country,
    );
  }

  sendCertificateIssued(email: string, name: string, courseTitle: string, code: string, country: Country) {
    return this.sendTemplate(
      'CERTIFICADO_GENERADO',
      email,
      {
        nombre: name,
        cursoTitulo: courseTitle,
        codigo: code,
        url_certificado: `${this.appUrl}/dashboard/student/certificates`,
      },
      country,
    );
  }

  sendCourseCompleted(email: string, examinerName: string, student: string, courseTitle: string, country: Country) {
    return this.sendTemplate(
      'CURSO_COMPLETADO',
      email,
      {
        examinerNombre: examinerName,
        estudiante: student,
        cursoTitulo: courseTitle,
        url_monitoreo: `${this.appUrl}/dashboard/examiner/monitoring`,
      },
      country,
    );
  }

  sendInactivityReminder(email: string, name: string, inactiveDays: number, country: Country) {
    return this.sendTemplate(
      'RECORDATORIO_INACTIVIDAD',
      email,
      { nombre: name, diasInactivo: inactiveDays, url_campus: `${this.appUrl}/dashboard` },
      country,
    );
  }

  /**
   * Aviso a quien pidió un código para solicitar acceso con un correo que ya tiene cuenta: en
   * lugar del código, cómo entrar. Lo recibe sólo el dueño del buzón.
   */
  async sendAccountExists(email: string, name: string, country: Country): Promise<void> {
    const html = await this.templates.wrap(
      `<h2 style="color:#1e293b;font-size:20px;margin:0 0 12px">¡Hola ${escapeHtml(name)}!</h2>
       <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px">
         Alguien —quizá tú— pidió acceso al campus con este correo, pero ya tienes una cuenta en
         el de <strong>${escapeHtml(countryName(country))}</strong>. No hace falta solicitarla de nuevo.
       </p>
       <div style="text-align:center;margin:28px 0">
         <a href="${this.appUrl}/login?sede=${country}" style="display:inline-block;background:#4f46e5;color:#fff;font-weight:700;padding:14px 36px;border-radius:12px;text-decoration:none;font-size:15px">Entrar al campus</a>
       </div>
       <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 12px">
         ¿No recuerdas tu contraseña? <a href="${this.appUrl}/forgot-password">Recupérala aquí</a>.
       </p>
       <p style="color:#94a3b8;font-size:12px;margin:0">Si no fuiste tú, puedes ignorar este correo.</p>`,
      country,
    );
    await this.transport.deliver(email, 'Ya tienes una cuenta en el campus', html);
  }

  /**
   * Aviso a quien pidió un código para solicitar acceso con un correo cuya solicitud sigue en
   * revisión: en lugar del código, que ya está en marcha. Lo recibe sólo el dueño del buzón.
   */
  async sendAccessRequestPending(email: string, country: Country): Promise<void> {
    const html = await this.templates.wrap(
      `<h2 style="color:#1e293b;font-size:20px;margin:0 0 12px">Tu solicitud sigue en revisión</h2>
       <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px">
         Alguien —quizá tú— pidió un código para solicitar acceso con este correo, pero ya hay una
         solicitud suya pendiente en el campus de <strong>${escapeHtml(countryName(country))}</strong>.
         Te escribiremos en cuanto los administradores la revisen.
       </p>
       <p style="color:#94a3b8;font-size:12px;margin:0">Si no fuiste tú, puedes ignorar este correo.</p>`,
      country,
    );
    await this.transport.deliver(email, 'Tu solicitud de acceso sigue en revisión', html);
  }

  /**
   * Código de verificación de correo.
   * Se envía antes de que exista cuenta, así que no hay sede de la que tomar la marca: se
   * usa la de la sede indicada o, en su defecto, la principal.
   */
  async sendVerificationCode(email: string, code: string, country: Country): Promise<void> {
    const html = await this.templates.wrap(
      `<h2 style="color:#1e293b;font-size:20px;margin:0 0 12px">Verificación de correo electrónico</h2>
       <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px">
         Escribe este código en la página de solicitud de acceso para confirmar que este correo es tuyo:
       </p>
       <div style="background:#f1f5f9;border-radius:12px;padding:24px;text-align:center;margin:0 0 20px">
         <span style="font-size:36px;font-weight:800;letter-spacing:8px;color:#1e293b;font-family:monospace">${code}</span>
       </div>
       <p style="color:#94a3b8;font-size:12px;margin:0">
         El código caduca en <strong>10 minutos</strong>. Si no has solicitado acceso, puedes ignorar este correo.
       </p>`,
      country,
    );
    await this.transport.deliver(email, 'Tu código de verificación', html);
  }
}
