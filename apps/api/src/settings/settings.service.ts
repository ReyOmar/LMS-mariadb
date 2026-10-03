import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { CountrySettings, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { uploadCeilingMb } from '../storage/upload-limits';
import { RealtimeService } from '../realtime/realtime.service';
import { COUNTRY_METADATA, COUNTRIES, Country } from '../common/domain/country';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UpdateCertificateSettingsDto } from './dto/update-certificate-settings.dto';
import { UpdateSignatureDto } from './dto/update-signature.dto';

/** Campos que guardan una clave de archivo y hay que limpiar del almacenamiento al reemplazarse. */
const FILE_FIELDS = ['logoUrl', 'faviconUrl', 'loginBackgroundUrl'] as const;

/**
 * Lo único que sale sin haber iniciado sesión.
 *
 * Es una lista de lo que se publica, no de lo que se oculta: así una columna nueva del
 * esquema no aparece en la respuesta pública sin que nadie lo decida.
 */
const PUBLIC_FIELDS = [
  'country',
  'platformName',
  'logoUrl',
  'faviconUrl',
  'loginBackgroundUrl',
  'primaryColor',
  'secondaryColor',
  'font',
  'borderRadius',
  'welcomeMessage',
  'maxFileMb',
  'landingHeroTitle1',
  'landingHeroTitle2',
  'landingHeroSubtitle',
  'landingPhone',
  'landingPhoneSub',
  'landingEmail',
  'landingEmailSub',
  'landingOffice',
  'landingOfficeSub',
  'landingFooterText',
  'legalEntityName',
  'legalEntityTaxId',
  'legalAddress',
  'privacyEmail',
  'legalUpdatedAt',
  'legalTerms',
  'legalPrivacy',
  'legalData',
] as const satisfies readonly (keyof CountrySettings)[];

/**
 * Campos que forman la política de datos y los términos. Cambiar cualquiera publica una
 * versión nueva de los textos legales.
 */
const LEGAL_FIELDS = [
  'legalEntityName',
  'legalEntityTaxId',
  'legalAddress',
  'privacyEmail',
  'legalTerms',
  'legalPrivacy',
  'legalData',
] as const satisfies readonly (keyof UpdateSettingsDto)[];

/** Versión de los textos legales que trae el campus mientras la sede no los edite. */
export const BASE_LEGAL_VERSION = '2026-09-26';

/** Versión legal de una configuración: la que se guarda como prueba del consentimiento. */
function legalVersionOf(config: Pick<CountrySettings, 'legalUpdatedAt'>): string {
  return config.legalUpdatedAt?.toISOString() ?? BASE_LEGAL_VERSION;
}

/** Lo que publica una configuración como textos legales, tal como consta en su versión. */
function legalSnapshot(config: CountrySettings): Prisma.LegalVersionCreateInput {
  const snapshot: Prisma.LegalVersionCreateInput = { country: config.country, version: legalVersionOf(config) };
  for (const field of LEGAL_FIELDS) snapshot[field] = config[field];
  return snapshot;
}

/** Vigencia de la caché de configuración. */
const CACHE_MS = 30_000;

/**
 * Configuración pública: lo que la portada y el acceso necesitan antes de autenticarse.
 *
 * `uploadCeilingMb` no es una columna: es el tope técnico del servidor (`MAX_UPLOAD_MB`),
 * con el que las pantallas validan los límites de subida antes de guardarlos.
 */
type PublicSettings = Pick<CountrySettings, (typeof PUBLIC_FIELDS)[number]> & { uploadCeilingMb: number };

/**
 * Configuración de cada sede.
 *
 * Existe exactamente una fila por país. Marca, textos de la portada, datos de contacto,
 * textos legales y ajustes de certificado son propios de cada sede: la dirección de la
 * oficina, el teléfono y la normativa de protección de datos difieren entre Colombia y
 * México, y mostrarlos mezclados sería incorrecto además de confuso.
 */
@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);

  /** Una entrada por sede. La piden todas las cargas de página, incluidas las anónimas. */
  private readonly cache = new Map<Country, { value: CountrySettings; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Prepara la configuración de las sedes al arrancar.
   *
   * Un fallo aquí **no impide arrancar**: si la base de datos todavía no responde, la
   * aplicación levanta igualmente, `/api/health` informa del problema y la configuración se
   * crea en cuanto alguien la pida (`loadSettings`). Abortar el arranque dejaría el
   * proceso en un ciclo de reinicios sin que nadie pudiera consultar qué está pasando.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.ensureSettingsForEachCountry();
    } catch (error) {
      this.logger.error(
        'No se pudo preparar la configuración de las sedes al arrancar. Se reintentará al primer uso.',
        error,
      );
    }
  }

  /**
   * Garantiza que cada país operativo tenga su fila.
   * Una sede nueva no exige crear su configuración a mano: basta con incluirla en `COUNTRIES`.
   */
  private async ensureSettingsForEachCountry(): Promise<void> {
    for (const country of COUNTRIES) {
      await this.createSettingsIfMissing(country);
    }
  }

  /** Crea la fila de una sede si no existe. Idempotente. */
  private async createSettingsIfMissing(country: Country): Promise<void> {
    const existing = await this.prisma.countrySettings.findUnique({ where: { country }, select: { id: true } });
    if (existing) return;

    const meta = COUNTRY_METADATA[country];
    await this.prisma.countrySettings.create({
      data: {
        country,
        platformName: 'PESV Education',
        timeZone: meta.timeZone,
        welcomeMessage: `Bienvenido a PESV Education ${meta.name}`,
        landingHeroSubtitle:
          'Plataforma integral para la gestión del Plan Estratégico de Seguridad Vial. Capacitación, ' +
          'evaluación y certificación de conductores.',
        // El contacto nace vacío: la portada no publica una tarjeta hasta que la sede la rellena.
        landingPhone: '',
        landingEmail: '',
        landingOffice: '',
        landingOfficeSub: '',
        landingFooterText: 'Plataforma de capacitación y certificación en seguridad vial para empresas de transporte.',
      },
    });
    this.logger.log(`Configuración inicial creada para ${meta.name}`);
  }

  // ── Lectura ──────────────────────────────────────────────────────────────

  /**
   * Configuración de la sede para uso interno del servidor. Trae la fila entera y se
   * cachea porque la piden muchas rutas y sólo cambia cuando un administrador la edita.
   */
  async getSettings(country: Country): Promise<CountrySettings> {
    const cached = this.cache.get(country);
    if (cached && Date.now() < cached.expiresAt) return cached.value;

    const row = await this.loadSettings(country);
    this.cache.set(country, { value: row, expiresAt: Date.now() + CACHE_MS });
    return row;
  }

  /** Lo que se devuelve a quien todavía no ha iniciado sesión. */
  async getPublicSettings(country: Country): Promise<PublicSettings> {
    return this.publicOnly(await this.getSettings(country));
  }

  /** Configuración completa, sólo para administradores de la sede. */
  getFullSettings(country: Country): Promise<CountrySettings> {
    return this.loadSettings(country);
  }

  /** Ajustes de impresión del certificado de la sede. */
  async getCertificateSettings(country: Country) {
    const config = await this.getSettings(country);
    return {
      certCustomTitle: config.certCustomTitle,
      certSubtitle: config.certSubtitle,
      certLegalText: config.certLegalText,
      certShowModules: config.certShowModules,
      certShowResources: config.certShowResources,
      certShowScore: config.certShowScore,
      certShowSignature: config.certShowSignature,
      certShowEnrollmentDate: config.certShowEnrollmentDate,
      certValidityMonths: config.certValidityMonths,
      platformName: config.platformName,
      primaryColor: config.primaryColor,
      secondaryColor: config.secondaryColor,
    };
  }

  /**
   * Versión vigente de la política de datos de la sede. Es la que queda registrada como
   * prueba de la autorización, y al cambiar hace que se vuelva a pedir.
   */
  async legalVersion(country: Country): Promise<string> {
    return legalVersionOf(await this.getSettings(country));
  }

  /**
   * Versiones de los textos legales registradas en la sede, de la más reciente a la más
   * antigua. Sólo lo que las identifica: los textos se piden de uno en uno.
   */
  async getLegalVersions(country: Country) {
    const [rows, current] = await Promise.all([
      this.prisma.legalVersion.findMany({
        where: { country },
        select: { id: true, version: true, createdAt: true },
        // Se registran en el orden en que se publican.
        orderBy: { id: 'desc' },
      }),
      this.legalVersion(country),
    ]);
    return rows.map((row) => ({ ...row, current: row.version === current }));
  }

  /** Una versión legal de la sede con lo que decía. La de otra sede no existe para quien pregunta. */
  async getLegalVersion(id: number, country: Country) {
    const row = await this.prisma.legalVersion.findFirst({ where: { id, country } });
    if (!row) throw new NotFoundException('Versión de los textos legales no encontrada.');
    return row;
  }

  /** Tamaño máximo de subida configurado para la sede, en MB. */
  async getMaxUploadMb(country: Country): Promise<number> {
    const config = await this.loadSettings(country);
    return config.maxFileMb;
  }

  /**
   * Configuración de una sede, creándola si todavía no existe.
   *
   * La creación perezosa cubre el caso en que la base de datos no estuviera disponible al
   * arrancar: la primera petición que necesite la configuración la deja lista, en lugar de
   * dejar la sede inservible hasta el siguiente reinicio.
   */
  private async loadSettings(country: Country): Promise<CountrySettings> {
    const config = await this.prisma.countrySettings.findUnique({ where: { country } });
    if (config) return config;

    await this.createSettingsIfMissing(country);

    const created = await this.prisma.countrySettings.findUnique({ where: { country } });
    if (!created) {
      // Preferible un error explícito a devolver valores inventados, que acabarían
      // impresos en un certificado.
      throw new NotFoundException(`No hay configuración registrada para ${country}.`);
    }
    return created;
  }

  private publicOnly(config: CountrySettings): PublicSettings {
    const publicSettings = {} as Record<string, unknown>;
    for (const field of PUBLIC_FIELDS) publicSettings[field] = config[field];
    publicSettings.uploadCeilingMb = uploadCeilingMb();
    return publicSettings as PublicSettings;
  }

  // ── Escritura ────────────────────────────────────────────────────────────

  /**
   * Actualiza la configuración de una sede y borra del almacenamiento los archivos que
   * hayan quedado reemplazados, para que el logo antiguo no siga ocupando espacio.
   */
  async updateSettings(country: Country, dto: UpdateSettingsDto): Promise<CountrySettings> {
    const current = await this.loadSettings(country);

    const legalChanged = LEGAL_FIELDS.some((field) => dto[field] !== undefined && dto[field] !== current[field]);

    // Configuración y registro de la versión legal van juntos: una versión publicada sin
    // constancia de lo que decía no serviría como prueba de lo que se aceptó.
    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.countrySettings.update({
        where: { country },
        data: { ...dto, ...(legalChanged && { legalUpdatedAt: new Date() }) },
      });
      if (legalChanged) await this.recordLegalVersion(tx, current, saved);
      return saved;
    });
    this.invalidateCache(country);

    await this.deleteReplacedFiles(current, dto);

    this.realtime.emitToCountry('config:updated', this.publicOnly(updated), country);
    return updated;
  }

  /**
   * Deja constancia de la versión legal que se publica.
   *
   * La sustituida se guarda también si no constaba —se publicó antes de que existiera este
   * registro— porque alguien pudo aceptarla. Si ya constaba no se toca: lo que dijo una
   * versión publicada no cambia.
   */
  private async recordLegalVersion(
    tx: Prisma.TransactionClient,
    replaced: CountrySettings,
    published: CountrySettings,
  ): Promise<void> {
    const previous = legalSnapshot(replaced);
    await tx.legalVersion.upsert({
      where: { country_version: { country: previous.country, version: previous.version } },
      create: previous,
      update: {},
    });
    await tx.legalVersion.create({ data: legalSnapshot(published) });
  }

  /** Actualiza sólo los ajustes del certificado. */
  async updateCertificateSettings(country: Country, dto: UpdateCertificateSettingsDto) {
    await this.prisma.countrySettings.update({ where: { country }, data: dto });
    this.invalidateCache(country);

    this.realtime.emitToCountry('config:updated', await this.getPublicSettings(country), country);
    return this.getCertificateSettings(country);
  }

  /**
   * Limpia los archivos sustituidos. Se hace después de guardar: si el borrado falla, la
   * configuración ya quedó correcta y sólo sobra un archivo huérfano, que queda anotado en
   * el registro del servidor.
   */
  private async deleteReplacedFiles(current: CountrySettings, dto: UpdateSettingsDto): Promise<void> {
    const replaced = FILE_FIELDS.map((field) => {
      const previous = current[field];
      const newValue = dto[field];
      return newValue !== undefined && previous && previous !== newValue ? previous : null;
    });

    await this.storage.deleteFiles(replaced);
  }

  private invalidateCache(country: Country): void {
    this.cache.delete(country);
  }

  // ── Firma del examinador ─────────────────────────────────────────────────

  /**
   * Firma del usuario en sesión.
   *
   * La imagen sale como URL firmada y caducable: una firma digital no puede quedar
   * accesible para cualquiera que conserve el enlace.
   */
  async getSignature(userGuid: string) {
    const user = await this.prisma.user.findUnique({
      where: { guid: userGuid },
      select: { signatureUrl: true, signatureName: true, signatureTitle: true, firstName: true, lastName: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');

    return { ...user, signatureUrl: user.signatureUrl ? this.storage.downloadUrl(user.signatureUrl) : null };
  }

  /**
   * Guarda la firma del examinador y retira del almacenamiento la imagen anterior.
   * `signatureUrl` llega como clave de la carpeta `firmas`, tal y como la devolvió la subida.
   */
  async updateSignature(userGuid: string, dto: UpdateSignatureDto) {
    const current = await this.prisma.user.findUnique({
      where: { guid: userGuid },
      select: { signatureUrl: true },
    });
    if (!current) throw new NotFoundException('Usuario no encontrado.');

    const updated = await this.prisma.user.update({
      where: { guid: userGuid },
      data: dto,
      select: { signatureUrl: true, signatureName: true, signatureTitle: true, firstName: true, lastName: true },
    });

    if (dto.signatureUrl !== undefined && current.signatureUrl && current.signatureUrl !== dto.signatureUrl) {
      await this.storage
        .deleteFile(current.signatureUrl)
        .catch((error) => this.logger.warn(`No se pudo borrar la firma anterior ${current.signatureUrl}`, error));
    }

    return {
      ...updated,
      signatureUrl: updated.signatureUrl ? this.storage.downloadUrl(updated.signatureUrl) : null,
    };
  }

  /** Firma del examinador responsable de un curso, para previsualizar el certificado. */
  async getSignatureByCourse(courseGuid: string, country: Country) {
    const course = await this.prisma.course.findFirst({
      where: { guid: courseGuid, country },
      select: {
        title: true,
        teacher: {
          select: { signatureUrl: true, signatureName: true, signatureTitle: true, firstName: true, lastName: true },
        },
      },
    });
    if (!course) throw new NotFoundException('Curso no encontrado.');

    return {
      ...course,
      teacher: {
        ...course.teacher,
        signatureUrl: course.teacher.signatureUrl ? this.storage.downloadUrl(course.teacher.signatureUrl) : null,
      },
    };
  }
}
