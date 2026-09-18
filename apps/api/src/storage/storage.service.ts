import { BadRequestException, Injectable, Logger, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Carpeta, esClavePublica } from './storage.carpetas';

const DIRECTORIO_LOCAL = path.join(process.cwd(), 'uploads');

/** Extensiones admitidas y su tipo MIME. Lo que no esté aquí no se sube. */
const TIPOS_PERMITIDOS: Readonly<Record<string, string>> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.zip': 'application/zip',
  '.rar': 'application/vnd.rar',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  // Un SVG puede llevar scripts dentro. Se admite porque los logotipos suelen venir en
  // este formato, pero el controlador lo sirve con una CSP que impide su ejecución
  // (`StorageController.cabecerasDeSeguridad`).
  '.svg': 'image/svg+xml',
};

/** Formatos que sólo son seguros con cabeceras de contención adicionales. */
export const FORMATOS_CON_RIESGO_ACTIVO = ['.svg'] as const;

/**
 * Firmas de archivo conocidas, para detectar un binario renombrado.
 * Un formato sin firma definida (texto plano, CSV, ofimática antigua) no se comprueba.
 */
const FIRMAS: Readonly<Record<string, readonly number[][]>> = {
  '.pdf': [[0x25, 0x50, 0x44, 0x46]],
  '.png': [[0x89, 0x50, 0x4e, 0x47]],
  '.jpg': [[0xff, 0xd8, 0xff]],
  '.jpeg': [[0xff, 0xd8, 0xff]],
  '.gif': [[0x47, 0x49, 0x46, 0x38]],
  '.webp': [[0x52, 0x49, 0x46, 0x46]],
  // Los formatos de Office modernos son ZIP por dentro, de ahí la misma firma.
  '.zip': [
    [0x50, 0x4b, 0x03, 0x04],
    [0x50, 0x4b, 0x05, 0x06],
  ],
  '.docx': [[0x50, 0x4b, 0x03, 0x04]],
  '.xlsx': [[0x50, 0x4b, 0x03, 0x04]],
  '.pptx': [[0x50, 0x4b, 0x03, 0x04]],
  '.mp3': [
    [0x49, 0x44, 0x33],
    [0xff, 0xfb],
    [0xff, 0xf3],
    [0xff, 0xf2],
  ],
};

/** Tope absoluto del servidor. Cada sede puede fijar un límite menor en su configuración. */
export const TAMANO_MAXIMO_BYTES = 50 * 1024 * 1024;

/** Vigencia por defecto de una URL firmada. Suficiente para abrir o descargar el archivo. */
const VIGENCIA_FIRMA_S = 60 * 60;

/** Archivo recuperado del almacenamiento remoto. */
interface ArchivoRemoto {
  contenido: Buffer;
  contentType: string;
}

/**
 * Almacenamiento de archivos con dos destinos posibles: Cloudflare R2 si está configurado
 * y el disco local en caso contrario.
 *
 * La clave de un archivo es siempre `carpeta/nombre` y es idéntica en los dos destinos.
 * Antes el destino local aplanaba la ruta y guardaba `nombre` mientras la base de datos
 * registraba `carpeta/nombre`; la limpieza periódica comparaba ambas listas, no encontraba
 * coincidencias y borraba archivos que sí estaban en uso.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client | null = null;
  private readonly bucket: string;
  private readonly urlPublica: string;
  private readonly secretoFirma: string;

  constructor(private readonly config: ConfigService) {
    fs.mkdirSync(DIRECTORIO_LOCAL, { recursive: true });

    this.bucket = this.config.get<string>('R2_BUCKET_NAME') ?? 'lms-uploads';
    this.urlPublica = (this.config.get<string>('R2_PUBLIC_URL') ?? '').replace(/\/+$/, '');
    // Las URLs firmadas usan su propio secreto si existe; si no, el del JWT, que ya es
    // obligatorio y se valida al arrancar.
    this.secretoFirma = this.config.get<string>('STORAGE_SECRET') || this.config.get<string>('JWT_SECRET') || '';

    const accountId = this.config.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY');

    if (accountId && accessKeyId && secretAccessKey) {
      this.s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
      });
      this.logger.log('Almacenamiento en Cloudflare R2');
    } else {
      this.logger.warn(
        'R2 no configurado: los archivos se guardan en disco local. En cPanel es válido si el directorio persiste entre despliegues.',
      );
    }
  }

  /** Indica si el almacenamiento remoto está activo. */
  get usaAlmacenamientoRemoto(): boolean {
    return this.s3 !== null;
  }

  // ── Subida ───────────────────────────────────────────────────────────────

  /**
   * Guarda un archivo y devuelve su clave (`carpeta/nombre`).
   *
   * @param maxBytes Tope específico de la operación, normalmente el configurado por la
   *        sede. Nunca puede superar el tope del servidor.
   * @throws BadRequestException si la extensión no está admitida o el contenido no
   *         corresponde a la extensión.
   * @throws PayloadTooLargeException si excede el tamaño permitido.
   */
  async uploadFromBuffer(
    contenido: Buffer,
    nombreOriginal: string,
    carpeta: Carpeta,
    maxBytes: number = TAMANO_MAXIMO_BYTES,
  ): Promise<string> {
    const extension = path.extname(nombreOriginal).toLowerCase();
    const contentType = TIPOS_PERMITIDOS[extension];

    if (!contentType) {
      throw new BadRequestException(
        `No se admiten archivos "${extension || 'sin extensión'}". Formatos válidos: ${Object.keys(TIPOS_PERMITIDOS).join(', ')}.`,
      );
    }

    const tope = Math.min(maxBytes, TAMANO_MAXIMO_BYTES);
    if (contenido.length > tope) {
      throw new PayloadTooLargeException(
        `El archivo pesa ${this.enMB(contenido.length)} MB y el máximo permitido es ${this.enMB(tope)} MB.`,
      );
    }

    this.verificarFirmaDeArchivo(contenido, extension);

    const clave = `${carpeta}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}${extension}`;
    await this.escribir(clave, contenido, contentType);
    return clave;
  }

  /** Guarda un archivo con una clave ya decidida (certificados generados por el servidor). */
  async guardarConClave(clave: string, contenido: Buffer, contentType: string): Promise<void> {
    await this.escribir(clave, contenido, contentType);
  }

  private async escribir(clave: string, contenido: Buffer, contentType: string): Promise<void> {
    if (this.s3) {
      await this.s3.send(
        new PutObjectCommand({ Bucket: this.bucket, Key: clave, Body: contenido, ContentType: contentType }),
      );
      this.logger.log(`Guardado en R2: ${clave} (${this.enMB(contenido.length)} MB)`);
      return;
    }

    const destino = path.join(DIRECTORIO_LOCAL, clave);
    await fs.promises.mkdir(path.dirname(destino), { recursive: true });
    await fs.promises.writeFile(destino, contenido);
    this.logger.log(`Guardado en disco: ${clave} (${this.enMB(contenido.length)} MB)`);
  }

  /**
   * Comprueba que los primeros bytes del archivo correspondan a su extensión.
   * Impide subir un ejecutable renombrado como `.pdf`.
   */
  private verificarFirmaDeArchivo(contenido: Buffer, extension: string): void {
    const esperadas = FIRMAS[extension];
    if (!esperadas || contenido.length < 4) return;

    const coincide = esperadas.some((firma) => firma.every((byte, i) => contenido[i] === byte));
    if (!coincide) {
      throw new BadRequestException(
        `El contenido del archivo no corresponde a un ${extension}. Puede estar dañado o tener la extensión cambiada.`,
      );
    }
  }

  // ── Lectura ──────────────────────────────────────────────────────────────

  /** Recupera un archivo. Devuelve `null` si no existe en el destino activo. */
  async leer(clave: string): Promise<ArchivoRemoto | null> {
    if (this.s3) {
      try {
        const respuesta = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: clave }));
        if (!respuesta.Body) return null;

        const trozos: Uint8Array[] = [];
        for await (const trozo of respuesta.Body as AsyncIterable<Uint8Array>) trozos.push(trozo);

        return {
          contenido: Buffer.concat(trozos),
          contentType: respuesta.ContentType ?? this.contentTypeDe(clave),
        };
      } catch (error) {
        this.logger.warn(`No se pudo leer de R2: ${clave} — ${(error as Error)?.message}`);
        return null;
      }
    }

    const ruta = path.join(DIRECTORIO_LOCAL, clave);
    if (!fs.existsSync(ruta)) return null;
    return { contenido: await fs.promises.readFile(ruta), contentType: this.contentTypeDe(clave) };
  }

  /** Ruta absoluta de un archivo local. Sólo tiene sentido sin almacenamiento remoto. */
  rutaLocal(clave: string): string {
    const ruta = path.join(DIRECTORIO_LOCAL, clave);
    if (!fs.existsSync(ruta)) throw new NotFoundException('Archivo no encontrado.');
    return ruta;
  }

  /** Lista las claves presentes en el disco local, con su fecha de modificación. */
  async listarLocales(): Promise<{ clave: string; modificado: number }[]> {
    const resultado: { clave: string; modificado: number }[] = [];

    const recorrer = async (directorio: string, prefijo: string): Promise<void> => {
      const entradas = await fs.promises.readdir(directorio, { withFileTypes: true });
      for (const entrada of entradas) {
        const ruta = path.join(directorio, entrada.name);
        const clave = prefijo ? `${prefijo}/${entrada.name}` : entrada.name;
        if (entrada.isDirectory()) {
          await recorrer(ruta, clave);
        } else if (entrada.isFile()) {
          const stat = await fs.promises.stat(ruta);
          resultado.push({ clave, modificado: stat.mtimeMs });
        }
      }
    };

    if (fs.existsSync(DIRECTORIO_LOCAL)) await recorrer(DIRECTORIO_LOCAL, '');
    return resultado;
  }

  // ── Borrado ──────────────────────────────────────────────────────────────

  /** Elimina un archivo del destino activo. No falla si ya no existe. */
  async deleteFile(clave: string | null | undefined): Promise<void> {
    if (!clave) return;

    if (this.s3) {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: clave }));
      this.logger.log(`Borrado de R2: ${clave}`);
      return;
    }

    const ruta = path.join(DIRECTORIO_LOCAL, clave);
    await fs.promises.rm(ruta, { force: true });
    this.logger.log(`Borrado de disco: ${clave}`);
  }

  // ── URLs ─────────────────────────────────────────────────────────────────

  /**
   * URL con la que el navegador puede pedir el archivo.
   *
   * Los archivos de marca se sirven sin más; los reservados —entregas, certificados,
   * firmas y material de curso— llevan una firma con caducidad, de modo que una URL
   * filtrada deja de funcionar sola en lugar de quedar accesible indefinidamente.
   */
  urlDeDescarga(clave: string, vigenciaSegundos: number = VIGENCIA_FIRMA_S): string {
    if (esClavePublica(clave)) return `/api/storage/download/${clave}`;

    const caduca = Math.floor(Date.now() / 1000) + vigenciaSegundos;
    return `/api/storage/download/${clave}?exp=${caduca}&sig=${this.firmar(clave, caduca)}`;
  }

  /** Comprueba la firma de una descarga reservada. */
  firmaValida(clave: string, exp: string | undefined, sig: string | undefined): boolean {
    const caduca = Number(exp);
    if (!sig || !Number.isFinite(caduca)) return false;
    if (caduca * 1000 < Date.now()) return false;

    const esperada = Buffer.from(this.firmar(clave, caduca));
    const recibida = Buffer.from(sig);
    // Comparación en tiempo constante: evita deducir la firma midiendo respuestas.
    return esperada.length === recibida.length && crypto.timingSafeEqual(esperada, recibida);
  }

  private firmar(clave: string, caduca: number): string {
    return crypto.createHmac('sha256', this.secretoFirma).update(`${clave}:${caduca}`).digest('hex');
  }

  /** URL pública directa del CDN, si está configurado. */
  urlPublicaDirecta(clave: string): string | null {
    return this.urlPublica ? `${this.urlPublica}/${clave}` : null;
  }

  contentTypeDe(clave: string): string {
    const extension = path.extname(clave).toLowerCase();
    return TIPOS_PERMITIDOS[extension] ?? 'application/octet-stream';
  }

  private enMB(bytes: number): string {
    return (bytes / 1024 / 1024).toFixed(1);
  }
}
