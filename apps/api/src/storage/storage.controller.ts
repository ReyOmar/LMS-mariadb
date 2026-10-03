import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import * as path from 'path';
import { StorageService, ACTIVE_CONTENT_FORMATS } from './storage.service';
import { contentDisposition } from './content-disposition';
import { ByteRange, parseByteRange } from './byte-range';
import { receiveFile } from './multipart';
import { Folder, isFolder, isPublicKey, isStorageKey } from './folders';
import { uploadLimit } from './upload-limits';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { SettingsService } from '../settings/settings.service';

/** Carpetas donde puede escribir directamente quien gestiona contenido. */
const UPLOAD_FOLDERS: Folder[] = ['portadas', 'recursos', 'firmas', 'logos', 'fondos'];

@Controller('storage')
export class StorageController {
  constructor(
    private readonly storage: StorageService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Sube un archivo de contenido (portada de curso, material, firma, logotipo).
   * Las entregas de los alumnos no pasan por aquí: tienen su propio endpoint en
   * evaluaciones, que además comprueba la matrícula.
   *
   * Las imágenes tienen un tope fijo de pocos MB; el material de curso, el general de la sede.
   */
  @Roles('ADMIN', 'TEACHER')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post('/upload')
  async uploadFile(@CurrentUser() user: JwtPayload, @Req() req: FastifyRequest, @Query('folder') folder?: string) {
    if (!isFolder(folder) || !UPLOAD_FOLDERS.includes(folder)) {
      throw new BadRequestException(`Indica una carpeta válida: ${UPLOAD_FOLDERS.join(', ')}.`);
    }
    if ((folder === 'logos' || folder === 'fondos') && user.role !== 'ADMIN') {
      throw new ForbiddenException('Sólo un administrador puede cambiar la identidad visual.');
    }

    const siteMb = folder === 'recursos' ? await this.settings.getMaxUploadMb(user.country) : undefined;
    const limit = uploadLimit(folder, siteMb);

    const file = await receiveFile(req, limit);
    const key = await this.storage.uploadFromDisk(file.filePath, file.name, folder, user, limit.bytes);

    return { filename: key, url: this.storage.downloadUrl(key, file.name) };
  }

  /**
   * Sirve un archivo.
   *
   * Es una ruta pública porque las etiquetas `<img>`, `<video>` y `<a>` no pueden enviar
   * la cabecera `Authorization`. El control de acceso lo aporta la firma:
   *
   *  - Material de marca (`logos/`, `portadas/`, `fondos/`, `avatars/`): acceso libre.
   *  - Entregas, certificados, firmas y material de curso: exigen `exp` y `sig`, que
   *    genera la API sólo para quien tiene derecho a ver el archivo y caducan en una hora.
   */
  @Public()
  @Get('/download/*')
  async downloadFile(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Query('originalName') originalName?: string,
    @Query('exp') exp?: string,
    @Query('sig') sig?: string,
  ) {
    // Fastify ya entrega el parámetro decodificado; decodificarlo otra vez convertiría un
    // `%` del nombre en un fallo interno.
    const key = (req.params as Record<string, string | undefined>)['*'];
    if (!isStorageKey(key)) {
      throw new BadRequestException('Ruta de archivo no válida.');
    }

    if (!isPublicKey(key) && !this.storage.isValidSignature(key, exp, sig)) {
      throw new ForbiddenException(
        'El enlace de descarga no es válido o ha caducado. Vuelve a abrirlo desde la plataforma.',
      );
    }

    // Con CDN configurado se redirige, salvo en los reservados: un CDN público anularía
    // la caducidad de la firma.
    const cdnUrl = isPublicKey(key) ? this.storage.directPublicUrl(key) : null;
    if (cdnUrl) {
      return reply.redirect(cdnUrl, 302);
    }

    // Se envía como flujo: el archivo no llega a materializarse en la memoria del servidor.
    const partial = await this.requestedRange(key, req, reply);
    const file = await this.storage.openStream(key, partial?.range);
    if (!file) throw new NotFoundException('Archivo no encontrado.');

    const downloadName = this.buildDownloadName(key, originalName);
    for (const [header, value] of Object.entries(this.securityHeaders(key, file.contentType, downloadName))) {
      reply.header(header, value);
    }
    reply.header('Accept-Ranges', 'bytes');
    if (partial) {
      const { range, size } = partial;
      reply.code(HttpStatus.PARTIAL_CONTENT).header('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
    }
    // Con el tamaño declarado, el navegador puede enseñar el progreso de la descarga.
    if (file.size !== null) reply.header('Content-Length', String(file.size));

    return reply.send(file.stream);
  }

  /**
   * Fragmento pedido con `Range`: lo usan los reproductores para saltar dentro de un vídeo y
   * los navegadores para reanudar una descarga.
   *
   * Con `If-Range` se envía el archivo entero: las respuestas no llevan validadores (ETag,
   * Last-Modified), así que no hay forma de saber si el fragmento es del mismo archivo.
   *
   * @returns `null` para enviar el archivo entero.
   * @throws HttpException 416 si el fragmento queda fuera del archivo.
   */
  private async requestedRange(
    key: string,
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<{ range: ByteRange; size: number } | null> {
    const header = req.headers.range;
    if (!header || req.headers['if-range']) return null;

    const size = await this.storage.fileSize(key);
    if (size === null) return null;

    const range = parseByteRange(header, size);
    if (range === 'unsatisfiable') {
      reply.header('Content-Range', `bytes */${size}`);
      throw new HttpException(
        'El fragmento pedido queda fuera del archivo.',
        HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE,
      );
    }
    return range && { range, size };
  }

  /** La limpieza del nombre la hace `contentDisposition`, que es quien escribe la cabecera. */
  private buildDownloadName(key: string, originalName?: string): string {
    return originalName ? path.basename(originalName) : path.basename(key);
  }

  private securityHeaders(key: string, contentType: string, name: string): Record<string, string> {
    const extension = path.extname(key).toLowerCase();
    const risky = (ACTIVE_CONTENT_FORMATS as readonly string[]).includes(extension);

    return {
      'Content-Type': contentType,
      // Impide que el navegador reinterprete el tipo del contenido.
      'X-Content-Type-Options': 'nosniff',
      // Un SVG se muestra bien dentro de <img> con esta política; si alguien navega
      // directamente a él, la CSP bloquea cualquier script que llevara dentro.
      ...(risky ? { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" } : {}),
      'Content-Disposition': contentDisposition('inline', name),
      // Los archivos reservados no se cachean en intermediarios compartidos.
      'Cache-Control': isPublicKey(key) ? 'public, max-age=86400' : 'private, max-age=300',
    };
  }
}
