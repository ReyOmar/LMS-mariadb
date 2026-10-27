import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../storage/storage.service';
import { Country, countryName } from '../common/domain/country';
import { formatScore } from '../common/domain/grading';
import { campusUrl } from '../common/http/campus-url';
import { UserRole } from '../common/interfaces/jwt-payload.interface';
import { UpdateTemplateDto } from './dto/update-template.dto';

/** Reintentos ante un fallo puntual del proveedor de correo. */
const MAX_RETRIES = 3;

/** Espera máxima por respuesta del proveedor antes de dar el intento por perdido. */
const TIMEOUT_MS = 15_000;

/**
 * Correos en curso a la vez en un envío en bloque (avisar a todos los matriculados de un
 * curso, a todos los administradores de una sede). Sin tope, cientos de peticiones
 * simultáneas acaban rechazadas por el proveedor.
 */
export const MAIL_CONCURRENCY = 5;

/**
 * Correos sin los que una cuenta no se puede usar: el enlace para recuperar la contraseña y la
 * contraseña temporal de bienvenida. Sus plantillas se editan, pero no se desactivan.
 */
const ESSENTIAL_EVENTS: ReadonlySet<string> = new Set(['RECUPERAR_PASSWORD', 'USUARIO_APROBADO']);

/**
 * Cuánto se reutiliza una plantilla leída de la base. En un envío en bloque todos los
 * correos usan la misma; editarla desde el panel la invalida en el acto.
 */
const TEMPLATE_CACHE_MS = 30_000;

/** Lo que hace falta de una plantilla para componer el correo. */
interface ActiveTemplate {
  subject: string;
  bodyHtml: string;
}

/**
 * Variables que la plantilla recibe ya como HTML.
 *
 * Son fragmentos que compone este mismo servicio —un párrafo con color según la nota, un
 * recuadro con el comentario— y por eso se insertan tal cual. Todo lo demás se escapa.
 * Cualquier texto de una persona que entre en uno de estos fragmentos tiene que escaparse
 * **aquí**, al componerlo: es la única excepción y conviene que se vea.
 */
const MARKUP_VARIABLES = new Set(['mensaje_aprobacion', 'comentario', 'motivo']);

/** Caracteres que cambian el significado del HTML si llegan sin escapar. */
const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

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
 * Las plantillas se guardan en base de datos y cada sede edita las suyas desde el panel.
 * La plantilla y la marca del correo (logotipo, color, nombre) salen **de la sede del
 * destinatario**, por eso todos los métodos reciben el país.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transport: nodemailer.Transporter | null = null;
  private brevoApiKey: string | null = null;

  /**
   * Plantilla activa de cada evento en cada sede (clave `sede:evento`), o `null` si no
   * tiene. Se guarda la promesa, no el valor: los correos de un envío en bloque que llegan
   * a la vez comparten una sola lectura.
   */
  private readonly templates = new Map<string, { value: Promise<ActiveTemplate | null>; expiresAt: number }>();

  private readonly sender: string | undefined;
  private readonly senderName: string;
  private readonly appUrl: string;
  private readonly apiUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly storage: StorageService,
  ) {
    this.sender = this.setting('MAIL_FROM');
    this.senderName = this.setting('MAIL_FROM_NAME') ?? 'Campus Virtual';
    this.appUrl = campusUrl(config);
    // Los correos necesitan URLs absolutas: una clave de almacenamiento relativa se ve
    // como una imagen rota en el cliente de correo.
    this.apiUrl = (this.setting('API_PUBLIC_URL') ?? 'http://localhost:3200').replace(/\/+$/, '');
  }

  /**
   * Una variable de entorno, o `undefined` si falta o está vacía. En cPanel es fácil dejar una
   * variable creada sin valor, y Brevo rechaza un remitente con el nombre o el correo vacíos.
   */
  private setting(name: string): string | undefined {
    return this.config.get<string>(name)?.trim() || undefined;
  }

  async onModuleInit(): Promise<void> {
    // Brevo rechaza un remitente que no esté verificado: sin él no se intenta enviar nada.
    if (!this.sender) {
      this.logger.error(
        'Correo DESACTIVADO: falta MAIL_FROM, la dirección remitente (en Brevo, una del dominio verificado).',
      );
      return;
    }

    const brevoApiKey = this.setting('BREVO_API_KEY');
    if (brevoApiKey) {
      this.brevoApiKey = brevoApiKey;
      this.logger.log('Correo activo mediante la API HTTP de Brevo');
      return;
    }

    const host = this.setting('SMTP_HOST');
    const user = this.setting('SMTP_USER');
    const password = this.setting('SMTP_PASS');
    const port = Number(this.setting('SMTP_PORT') ?? 587);

    // Sin usuario es un relé que no pide autenticación, como el buzón local de desarrollo.
    if (host) {
      this.transport = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: user ? { user, pass: password } : undefined,
      });
      this.logger.log(`Correo activo mediante SMTP en ${host}:${port}`);
      return;
    }

    this.logger.warn(
      'Correo DESACTIVADO: define BREVO_API_KEY (recomendado en cPanel) o SMTP_HOST. ' +
        'La aplicación funciona, pero no saldrá ningún correo.',
    );
  }

  /** Si hay un proveedor con el que enviar: sin él, el campus funciona pero no sale ningún correo. */
  get isConfigured(): boolean {
    return Boolean(this.brevoApiKey || this.transport);
  }

  // ── Envío ────────────────────────────────────────────────────────────────

  /**
   * Envía un correo con reintentos y espera creciente. Sin proveedor configurado no envía
   * nada, y eso no es un fallo.
   *
   * @throws si el proveedor sigue fallando tras los reintentos. Quien llama decide qué hacer
   *         con ello —registrarlo, contarlo o volver a intentarlo otro día—; ninguna operación
   *         espera al correo para confirmarse, así que nunca deshace lo que lo originó.
   */
  private async deliverToProvider(recipient: string, subject: string, html: string): Promise<void> {
    if (!this.brevoApiKey && !this.transport) {
      this.logger.debug(`Correo no enviado (servicio desactivado) → ${recipient}: ${subject}`);
      return;
    }

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (this.brevoApiKey) {
          await this.sendViaBrevo(this.brevoApiKey, recipient, subject, html);
        } else if (this.transport) {
          await this.transport.sendMail({
            from: `"${this.senderName}" <${this.sender}>`,
            to: recipient,
            subject,
            html,
          });
        }
        this.logger.log(`Correo enviado a ${recipient}: ${subject}`);
        return;
      } catch (error) {
        if (attempt === MAX_RETRIES) {
          throw new Error(`Correo a ${recipient} fallido tras ${MAX_RETRIES} intentos: ${(error as Error)?.message}`, {
            cause: error,
          });
        }
        await this.wait(2 ** (attempt - 1) * 1000);
      }
    }
  }

  private async sendViaBrevo(apiKey: string, recipient: string, subject: string, html: string): Promise<void> {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      // Sin límite, un proveedor que no responde deja la petición colgada para siempre y
      // los reintentos nunca llegan a producirse.
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: this.senderName, email: this.sender },
        to: [{ email: recipient }],
        subject,
        htmlContent: html,
      }),
    });

    if (!response.ok) {
      throw new Error(`Brevo respondió ${response.status}: ${await response.text()}`);
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ── Plantillas ───────────────────────────────────────────────────────────

  /**
   * Eventos de correo con las plantillas de la sede, para editarlas desde el panel. Cada uno
   * dice si es imprescindible: el panel no ofrece desactivarlo.
   */
  async getEvents(country: Country) {
    const events = await this.prisma.emailEvent.findMany({
      include: { templates: { where: { country }, orderBy: { id: 'asc' } } },
      orderBy: { key: 'asc' },
    });
    return events.map((event) => ({ ...event, essential: ESSENTIAL_EVENTS.has(event.key) }));
  }

  /** Edita una plantilla de la sede. La de la otra sede no existe para quien edita. */
  async updateTemplate(id: number, country: Country, dto: UpdateTemplateDto) {
    const template = await this.prisma.emailTemplate.findFirst({
      where: { id, country },
      select: { event: { select: { key: true } } },
    });
    if (!template) throw new NotFoundException('Plantilla no encontrada.');
    if (dto.active === false && ESSENTIAL_EVENTS.has(template.event.key)) {
      throw new BadRequestException(
        'Este correo es imprescindible para entrar al campus: puedes cambiar su texto, pero no desactivarlo.',
      );
    }

    const updated = await this.prisma.emailTemplate.update({ where: { id }, data: dto });
    // Activar o desactivar una puede cambiar cuál usa su evento: se vacía todo.
    this.templates.clear();
    return updated;
  }

  /** Plantilla activa del evento en la sede, reutilizada durante `TEMPLATE_CACHE_MS`. */
  private activeTemplate(key: string, country: Country): Promise<ActiveTemplate | null> {
    const cacheKey = `${country}:${key}`;
    const cached = this.templates.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) return cached.value;

    const value = this.prisma.emailEvent
      .findUnique({
        where: { key },
        select: {
          templates: {
            where: { country, active: true },
            orderBy: { id: 'asc' },
            take: 1,
            select: { subject: true, bodyHtml: true },
          },
        },
      })
      .then((event) => event?.templates[0] ?? null);
    this.templates.set(cacheKey, { value, expiresAt: Date.now() + TEMPLATE_CACHE_MS });
    // Un fallo de la base no se queda guardado: el siguiente correo vuelve a intentarlo.
    value.catch(() => {
      if (this.templates.get(cacheKey)?.value === value) this.templates.delete(cacheKey);
    });
    return value;
  }

  /**
   * Resuelve una plantilla sustituyendo sus variables.
   * Devuelve `null` si el evento no existe o no tiene ninguna plantilla activa, y quien
   * llama decide si eso es un fallo o simplemente un aviso que no se envía.
   */
  private async render(
    key: string,
    variables: Record<string, string | number>,
    country: Country,
  ): Promise<{ subject: string; html: string } | null> {
    const template = await this.activeTemplate(key, country);
    if (!template) {
      this.logger.warn(`No hay plantilla activa para el evento de correo "${key}" en ${country}`);
      return null;
    }

    let html = template.bodyHtml;
    let subject = template.subject;
    for (const [name, value] of Object.entries(variables)) {
      const placeholder = new RegExp(`{{\\s*${name}\\s*}}`, 'g');
      // El valor se escapa salvo que sea uno de los fragmentos que compone el servicio:
      // buena parte viene de texto que escribe una persona —el comentario de una
      // calificación, el título de un curso, un nombre con `&`— y sin escapar rompería la
      // maquetación del correo o metería etiquetas ajenas en él.
      const content = MARKUP_VARIABLES.has(name) ? String(value) : escapeHtml(value);
      // Con una función, `replace` no interpreta los `$&`, `$'`… que pueda traer el valor
      // —un título con «$'» metería en su sitio el resto de la plantilla—.
      html = html.replace(placeholder, () => content);
      subject = subject.replace(placeholder, () => String(value));
    }

    return { subject, html: await this.wrap(html, country) };
  }

  /** Aplica la cabecera, el pie y los colores de la sede al cuerpo del correo. */
  private async wrap(content: string, country: Country): Promise<string> {
    const config = await this.settings.getSettings(country);
    const title = escapeHtml(config.platformName);
    const color = config.primaryColor;

    const logo = config.logoUrl
      ? `<img src="${this.apiUrl}${this.storage.downloadUrl(config.logoUrl)}" alt="${title}" style="max-height:40px;vertical-align:middle" />`
      : `<h1 style="color:#ffffff;font-size:18px;margin:0;font-weight:700">${title}</h1>`;

    return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f8fafc">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06)">
    <div style="background:${color};padding:28px 32px">${logo}</div>
    <div style="padding:32px">${content}</div>
    <div style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center">
      <p style="color:#94a3b8;font-size:12px;margin:0">Correo automático de ${title}. No respondas a este mensaje.</p>
    </div>
  </div>
</body>
</html>`;
  }

  /** Envía el correo de un evento con su plantilla; sin plantilla activa, el aviso no se envía. */
  private async sendTemplate(
    key: string,
    recipient: string,
    variables: Record<string, string | number>,
    country: Country,
  ): Promise<void> {
    const template = await this.render(key, variables, country);
    if (template) await this.deliverToProvider(recipient, template.subject, template.html);
  }

  // ── Correos del sistema ──────────────────────────────────────────────────

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
   * Aviso a un administrador de que otro sistema espera un curso que todavía no se puede
   * ofrecer: no existe, no está publicado o no tiene plaza.
   */
  sendEnrollmentWaiting(
    adminEmail: string,
    adminName: string,
    waiting: { courseCode: string; people: string; reason: string },
    country: Country,
  ) {
    return this.sendTemplate(
      'MATRICULA_EN_ESPERA',
      adminEmail,
      {
        adminNombre: adminName,
        codigoCurso: waiting.courseCode,
        personas: waiting.people,
        causa: waiting.reason,
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
    const template = await this.render(
      'USUARIO_APROBADO',
      { nombre: name, email, tempPassword: temporaryPassword, sede: site, url_campus: loginUrl },
      country,
    );
    if (template) {
      await this.deliverToProvider(email, template.subject, template.html);
      return;
    }

    // Sin plantilla configurada la cuenta quedaría creada y el usuario sin conocer su
    // clave temporal, así que este correo tiene respaldo propio. Sólo para eso: si lo que
    // falla es el envío, repetirlo con otro texto no lo arregla y podría llegar dos veces.
    const html = await this.wrap(
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
    await this.deliverToProvider(email, 'Tu acceso al campus virtual está listo', html);
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
    const html = await this.wrap(
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
    await this.deliverToProvider(email, 'Ya tienes una cuenta en el campus', html);
  }

  /**
   * Aviso a quien pidió un código para solicitar acceso con un correo cuya solicitud sigue en
   * revisión: en lugar del código, que ya está en marcha. Lo recibe sólo el dueño del buzón.
   */
  async sendAccessRequestPending(email: string, country: Country): Promise<void> {
    const html = await this.wrap(
      `<h2 style="color:#1e293b;font-size:20px;margin:0 0 12px">Tu solicitud sigue en revisión</h2>
       <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px">
         Alguien —quizá tú— pidió un código para solicitar acceso con este correo, pero ya hay una
         solicitud suya pendiente en el campus de <strong>${escapeHtml(countryName(country))}</strong>.
         Te escribiremos en cuanto los administradores la revisen.
       </p>
       <p style="color:#94a3b8;font-size:12px;margin:0">Si no fuiste tú, puedes ignorar este correo.</p>`,
      country,
    );
    await this.deliverToProvider(email, 'Tu solicitud de acceso sigue en revisión', html);
  }

  /**
   * Código de verificación de correo.
   * Se envía antes de que exista cuenta, así que no hay sede de la que tomar la marca: se
   * usa la de la sede indicada o, en su defecto, la principal.
   */
  async sendVerificationCode(email: string, code: string, country: Country): Promise<void> {
    const html = await this.wrap(
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
    await this.deliverToProvider(email, 'Tu código de verificación', html);
  }
}
