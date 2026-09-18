import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { lms_configuracion } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { RealtimeService } from '../realtime/realtime.service';
import { METADATOS_PAIS, PAISES, Pais } from '../common/domain/pais';
import { UpdateConfiguracionDto } from './dto/update-configuracion.dto';
import { UpdateCertConfigDto } from './dto/update-cert-config.dto';
import { UpdateFirmaDto } from './dto/update-firma.dto';

/** Campos que guardan una clave de archivo y hay que limpiar del almacenamiento al reemplazarse. */
const CAMPOS_DE_ARCHIVO = ['logo_url', 'favicon_url', 'login_fondo_url'] as const;

/** Campos que nunca salen en la respuesta pública. */
const CAMPOS_SENSIBLES = ['contrasena_defecto'] as const;

/** Vigencia de la caché de configuración pública. */
const CACHE_MS = 30_000;

/** Configuración pública: lo que la portada y el login necesitan antes de autenticarse. */
export type ConfiguracionPublica = Omit<lms_configuracion, (typeof CAMPOS_SENSIBLES)[number]>;

/**
 * Configuración de cada sede.
 *
 * Existe exactamente una fila por país. Marca, textos de la portada, datos de contacto,
 * textos legales y ajustes de certificado son propios de cada sede: la dirección de la
 * oficina, el teléfono y la normativa de protección de datos difieren entre Colombia y
 * México, y mostrarlos mezclados sería incorrecto además de confuso.
 */
@Injectable()
export class ConfiguracionService implements OnModuleInit {
  private readonly logger = new Logger(ConfiguracionService.name);

  /** país → { config, caduca } para la configuración pública. */
  private readonly cache = new Map<Pais, { valor: ConfiguracionPublica; caduca: number }>();

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
   * crea en cuanto alguien la pida (`cargarConfiguracion`). Abortar el arranque dejaría el
   * proceso en un ciclo de reinicios sin que nadie pudiera consultar qué está pasando.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.asegurarConfiguracionDeCadaSede();
    } catch (error) {
      this.logger.error(
        'No se pudo preparar la configuración de las sedes al arrancar. Se reintentará al primer uso.',
        error,
      );
    }
  }

  /**
   * Garantiza que cada país operativo tenga su fila.
   * Añadir una sede nueva no exige una migración: basta con incluirla en `PAISES`.
   */
  private async asegurarConfiguracionDeCadaSede(): Promise<void> {
    for (const pais of PAISES) {
      await this.crearConfiguracionSiFalta(pais);
    }
  }

  /** Crea la fila de una sede si no existe. Idempotente. */
  private async crearConfiguracionSiFalta(pais: Pais): Promise<void> {
    const existente = await this.prisma.lms_configuracion.findUnique({ where: { pais }, select: { id: true } });
    if (existente) return;

    const meta = METADATOS_PAIS[pais];
    await this.prisma.lms_configuracion.create({
      data: {
        pais,
        nombre_plataforma: 'PESV Education',
        zona_horaria: meta.zonaHoraria,
        mensaje_bienvenida: `Bienvenido a PESV Education ${meta.nombre}`,
        landing_hero_subtitulo:
          'Plataforma integral para la gestión del Plan Estratégico de Seguridad Vial. Capacitación, ' +
          'evaluación y certificación de conductores.',
        landing_telefono: `${meta.prefijoTelefonico} 000 000 0000`,
        landing_email: `contacto.${meta.iso.toLowerCase()}@pesveducation.com`,
        landing_oficina: meta.nombre,
        landing_oficina_sub: 'Actualiza esta dirección desde el panel de administración',
        landing_footer_texto:
          'Plataforma de capacitación y certificación en seguridad vial para empresas de transporte.',
      },
    });
    this.logger.log(`Configuración inicial creada para ${meta.nombre}`);
  }

  // ── Lectura ──────────────────────────────────────────────────────────────

  /**
   * Configuración pública de una sede, sin campos sensibles.
   * Se cachea en memoria porque la piden todas las cargas de página, incluidas las
   * anónimas, y cambia sólo cuando un administrador la edita.
   */
  async getConfig(pais: Pais): Promise<ConfiguracionPublica> {
    const enCache = this.cache.get(pais);
    if (enCache && Date.now() < enCache.caduca) return enCache.valor;

    const fila = await this.cargarConfiguracion(pais);
    const publica = this.sinCamposSensibles(fila);
    this.cache.set(pais, { valor: publica, caduca: Date.now() + CACHE_MS });
    return publica;
  }

  /** Configuración completa, sólo para administradores de la sede. */
  getFullConfig(pais: Pais): Promise<lms_configuracion> {
    return this.cargarConfiguracion(pais);
  }

  /** Subconjunto que necesita la portada pública. */
  async getLandingConfig(pais: Pais) {
    const config = await this.getConfig(pais);
    return {
      pais: config.pais,
      nombre_plataforma: config.nombre_plataforma,
      logo_url: config.logo_url,
      color_primario: config.color_primario,
      color_secundario: config.color_secundario,
      fuente: config.fuente,
      border_radius: config.border_radius,
      landing_hero_titulo1: config.landing_hero_titulo1,
      landing_hero_titulo2: config.landing_hero_titulo2,
      landing_hero_subtitulo: config.landing_hero_subtitulo,
      landing_telefono: config.landing_telefono,
      landing_telefono_sub: config.landing_telefono_sub,
      landing_email: config.landing_email,
      landing_email_sub: config.landing_email_sub,
      landing_oficina: config.landing_oficina,
      landing_oficina_sub: config.landing_oficina_sub,
      landing_footer_texto: config.landing_footer_texto,
      legal_terminos: config.legal_terminos,
      legal_privacidad: config.legal_privacidad,
      legal_datos: config.legal_datos,
    };
  }

  /** Ajustes de impresión del certificado de la sede. */
  async getCertConfig(pais: Pais) {
    const config = await this.getConfig(pais);
    return {
      cert_titulo_personalizado: config.cert_titulo_personalizado,
      cert_subtitulo: config.cert_subtitulo,
      cert_texto_legal: config.cert_texto_legal,
      cert_mostrar_modulos: config.cert_mostrar_modulos,
      cert_mostrar_recursos: config.cert_mostrar_recursos,
      cert_mostrar_nota: config.cert_mostrar_nota,
      cert_mostrar_firma: config.cert_mostrar_firma,
      cert_mostrar_fecha_ingreso: config.cert_mostrar_fecha_ingreso,
      nombre_plataforma: config.nombre_plataforma,
      color_primario: config.color_primario,
      color_secundario: config.color_secundario,
    };
  }

  /** Contraseña temporal con la que se crean las cuentas de la sede. */
  async getContrasenaDefecto(pais: Pais): Promise<string> {
    const config = await this.cargarConfiguracion(pais);
    return config.contrasena_defecto;
  }

  /** Tamaño máximo de subida configurado para la sede, en MB. */
  async getMaxArchivoMb(pais: Pais): Promise<number> {
    const config = await this.cargarConfiguracion(pais);
    return config.max_archivo_mb;
  }

  /**
   * Configuración de una sede, creándola si todavía no existe.
   *
   * La creación perezosa cubre el caso en que la base de datos no estuviera disponible al
   * arrancar: la primera petición que necesite la configuración la deja lista, en lugar de
   * dejar la sede inservible hasta el siguiente reinicio.
   */
  private async cargarConfiguracion(pais: Pais): Promise<lms_configuracion> {
    const config = await this.prisma.lms_configuracion.findUnique({ where: { pais } });
    if (config) return config;

    await this.crearConfiguracionSiFalta(pais);

    const creada = await this.prisma.lms_configuracion.findUnique({ where: { pais } });
    if (!creada) {
      // Preferible un error explícito a devolver valores inventados, que acabarían
      // impresos en un certificado.
      throw new NotFoundException(`No hay configuración registrada para ${pais}.`);
    }
    return creada;
  }

  private sinCamposSensibles(config: lms_configuracion): ConfiguracionPublica {
    const copia = { ...config } as Partial<lms_configuracion>;
    for (const campo of CAMPOS_SENSIBLES) delete copia[campo];
    return copia as ConfiguracionPublica;
  }

  // ── Escritura ────────────────────────────────────────────────────────────

  /**
   * Actualiza la configuración de una sede y borra del almacenamiento los archivos que
   * hayan quedado reemplazados, para que el logo antiguo no siga ocupando espacio.
   */
  async updateConfig(pais: Pais, dto: UpdateConfiguracionDto): Promise<lms_configuracion> {
    const actual = await this.cargarConfiguracion(pais);

    const actualizada = await this.prisma.lms_configuracion.update({ where: { pais }, data: dto });
    this.invalidarCache(pais);

    await this.borrarArchivosReemplazados(actual, dto);

    this.realtime.emitirASede('config:updated', this.sinCamposSensibles(actualizada), pais);
    return actualizada;
  }

  /** Actualiza sólo los ajustes del certificado. */
  async updateCertConfig(pais: Pais, dto: UpdateCertConfigDto) {
    await this.prisma.lms_configuracion.update({ where: { pais }, data: dto });
    this.invalidarCache(pais);

    const publica = await this.getConfig(pais);
    this.realtime.emitirASede('config:updated', publica, pais);
    return this.getCertConfig(pais);
  }

  /**
   * Limpia los archivos sustituidos. Se hace después de guardar: si el borrado falla, la
   * configuración ya quedó correcta y sólo sobra un archivo huérfano, que el mantenimiento
   * periódico recogerá.
   */
  private async borrarArchivosReemplazados(actual: lms_configuracion, dto: UpdateConfiguracionDto): Promise<void> {
    for (const campo of CAMPOS_DE_ARCHIVO) {
      const anterior = actual[campo];
      const nuevo = dto[campo];
      if (nuevo === undefined || !anterior || anterior === nuevo) continue;

      try {
        await this.storage.deleteFile(anterior);
      } catch (error) {
        this.logger.warn(`No se pudo borrar el archivo reemplazado ${anterior}`, error);
      }
    }
  }

  private invalidarCache(pais: Pais): void {
    this.cache.delete(pais);
  }

  // ── Firma del examinador ─────────────────────────────────────────────────

  /**
   * Firma de un usuario. El `pais` acota la búsqueda: pedir la firma de alguien de otra
   * sede devuelve "no encontrado", igual que si el usuario no existiera.
   *
   * La imagen sale como URL firmada y caducable: una firma digital no puede quedar
   * accesible para cualquiera que conserve el enlace.
   */
  async getFirma(usuarioGuid: string, pais?: Pais) {
    const usuario = await this.prisma.usuarios.findFirst({
      where: { guid: usuarioGuid, ...(pais ? { pais } : {}) },
      select: { firma_url: true, firma_nombre: true, firma_cargo: true, nombre: true, apellido: true },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado.');

    return { ...usuario, firma_url: usuario.firma_url ? this.storage.urlDeDescarga(usuario.firma_url) : null };
  }

  /**
   * Guarda la firma del examinador y retira del almacenamiento la imagen anterior.
   * `firma_url` llega como clave de almacenamiento, tal y como la devolvió la subida.
   */
  async updateFirma(usuarioGuid: string, dto: UpdateFirmaDto) {
    const actual = await this.prisma.usuarios.findUnique({
      where: { guid: usuarioGuid },
      select: { firma_url: true },
    });
    if (!actual) throw new NotFoundException('Usuario no encontrado.');

    const actualizado = await this.prisma.usuarios.update({
      where: { guid: usuarioGuid },
      data: dto,
      select: { firma_url: true, firma_nombre: true, firma_cargo: true, nombre: true, apellido: true },
    });

    if (dto.firma_url !== undefined && actual.firma_url && actual.firma_url !== dto.firma_url) {
      await this.storage
        .deleteFile(actual.firma_url)
        .catch((error) => this.logger.warn(`No se pudo borrar la firma anterior ${actual.firma_url}`, error));
    }

    return {
      ...actualizado,
      firma_url: actualizado.firma_url ? this.storage.urlDeDescarga(actualizado.firma_url) : null,
    };
  }

  /** Firma del examinador responsable de un curso, para previsualizar el certificado. */
  async getFirmaPorCurso(cursoGuid: string, pais: Pais) {
    const curso = await this.prisma.lms_cursos.findFirst({
      where: { guid: cursoGuid, pais },
      select: {
        titulo: true,
        profesor: {
          select: { firma_url: true, firma_nombre: true, firma_cargo: true, nombre: true, apellido: true },
        },
      },
    });
    if (!curso) throw new NotFoundException('Curso no encontrado.');

    return {
      ...curso,
      profesor: {
        ...curso.profesor,
        firma_url: curso.profesor.firma_url ? this.storage.urlDeDescarga(curso.profesor.firma_url) : null,
      },
    };
  }
}
