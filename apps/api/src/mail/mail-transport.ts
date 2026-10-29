import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

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
 * Entrega de los correos al proveedor.
 *
 * Dos vías, por orden de preferencia:
 *  1. API HTTP de Brevo (puerto 443), que funciona en alojamientos donde los puertos SMTP
 *     están cerrados —el caso habitual en cPanel compartido—.
 *  2. SMTP clásico.
 *
 * Si no hay ninguna configurada, los envíos se registran y se descartan: el sistema sigue
 * funcionando sin correo, pero deja constancia en el registro de lo que no pudo enviar.
 */
@Injectable()
export class MailTransport implements OnModuleInit {
  private readonly logger = new Logger(MailTransport.name);
  private smtp: nodemailer.Transporter | null = null;
  private brevoApiKey: string | null = null;
  private readonly sender: string | undefined;
  private readonly senderName: string;

  constructor(private readonly config: ConfigService) {
    this.sender = this.setting('MAIL_FROM');
    this.senderName = this.setting('MAIL_FROM_NAME') ?? 'Campus Virtual';
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
      this.smtp = nodemailer.createTransport({
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
    return Boolean(this.brevoApiKey || this.smtp);
  }

  /**
   * Envía un correo con reintentos y espera creciente. Sin proveedor configurado no envía
   * nada, y eso no es un fallo.
   *
   * @throws si el proveedor sigue fallando tras los reintentos. Quien llama decide qué hacer
   *         con ello —registrarlo, contarlo o volver a intentarlo otro día—; ninguna operación
   *         espera al correo para confirmarse, así que nunca deshace lo que lo originó.
   */
  async deliver(recipient: string, subject: string, html: string): Promise<void> {
    if (!this.brevoApiKey && !this.smtp) {
      this.logger.debug(`Correo no enviado (servicio desactivado) → ${recipient}: ${subject}`);
      return;
    }

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (this.brevoApiKey) {
          await this.sendViaBrevo(this.brevoApiKey, recipient, subject, html);
        } else if (this.smtp) {
          await this.smtp.sendMail({
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
}
