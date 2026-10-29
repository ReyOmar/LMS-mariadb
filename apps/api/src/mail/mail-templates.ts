import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../storage/storage.service';
import { Country } from '../common/domain/country';
import { UpdateTemplateDto } from './dto/update-template.dto';

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
 * Son fragmentos que componen los correos del campus (`MailService`) —un párrafo con color
 * según la nota, un recuadro con el comentario— y por eso se insertan tal cual. Todo lo demás
 * se escapa.
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

/** El texto tal cual: lo que traiga de marcado no cuenta como HTML. */
export function escapeHtml(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/**
 * Las plantillas de correo de cada sede, que sus administradores editan desde el panel, y la
 * maquetación común: la cabecera, el pie y los colores de la sede del destinatario.
 */
@Injectable()
export class MailTemplates {
  private readonly logger = new Logger(MailTemplates.name);

  /**
   * Plantilla activa de cada evento en cada sede (clave `sede:evento`), o `null` si no
   * tiene. Se guarda la promesa, no el valor: los correos de un envío en bloque que llegan
   * a la vez comparten una sola lectura.
   */
  private readonly cache = new Map<string, { value: Promise<ActiveTemplate | null>; expiresAt: number }>();

  /** Los correos necesitan URLs absolutas: una clave de almacenamiento relativa se ve como una imagen rota. */
  private readonly apiUrl: string;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly storage: StorageService,
  ) {
    this.apiUrl = (config.get<string>('API_PUBLIC_URL')?.trim() || 'http://localhost:3200').replace(/\/+$/, '');
  }

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
    this.cache.clear();
    return updated;
  }

  /** Plantilla activa del evento en la sede, reutilizada durante `TEMPLATE_CACHE_MS`. */
  private activeTemplate(key: string, country: Country): Promise<ActiveTemplate | null> {
    const cacheKey = `${country}:${key}`;
    const cached = this.cache.get(cacheKey);
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
    this.cache.set(cacheKey, { value, expiresAt: Date.now() + TEMPLATE_CACHE_MS });
    // Un fallo de la base no se queda guardado: el siguiente correo vuelve a intentarlo.
    value.catch(() => {
      if (this.cache.get(cacheKey)?.value === value) this.cache.delete(cacheKey);
    });
    return value;
  }

  /**
   * Resuelve una plantilla sustituyendo sus variables.
   * Devuelve `null` si el evento no existe o no tiene ninguna plantilla activa, y quien
   * llama decide si eso es un fallo o simplemente un aviso que no se envía.
   */
  async render(
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
  async wrap(content: string, country: Country): Promise<string> {
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
}
