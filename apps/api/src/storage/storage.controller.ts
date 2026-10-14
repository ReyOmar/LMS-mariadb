import {
  BadRequestException,
  Controller,
  Delete,
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
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import * as path from 'path';
import { StorageService } from './storage.service';
import { FileOwnershipService } from './file-ownership.service';
import { contentDisposition } from './content-disposition';
import { ByteRange, parseByteRange } from './byte-range';
import { receiveFile } from './multipart';
import { hasActiveContent } from './file-formats';
import { UPLOAD_FOLDERS, isBrandKey, isFolder, isPublicKey, isStorageKey } from './folders';
import { uploadLimit } from './upload-limits';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { SettingsService } from '../settings/settings.service';
import { DiscardUploadDto } from './dto/discard-upload.dto';

const PUBLIC_CACHE_S = 24 * 60 * 60;
const RESERVED_CACHE_S = 5 * 60;

@Controller('storage')
export class StorageController {
  constructor(
    private readonly storage: StorageService,
    private readonly files: FileOwnershipService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Sube portadas, material, firmas y logotipos. Las entregas tienen su propia ruta en
   * evaluaciones, que además comprueba la matrícula.
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

  /** Retira una subida propia que no llegó a guardarse: el guardado falló o se descartó antes. */
  @Roles('ADMIN', 'TEACHER')
  @Delete('/upload')
  discardUpload(@CurrentUser() user: JwtPayload, @Query() { key }: DiscardUploadDto) {
    return this.files.discardOwnUpload(key, user.sub);
  }

  /**
   * Sirve un archivo. Es pública porque `<img>`, `<video>` y `<a>` no envían `Authorization`:
   * el acceso a los reservados lo da la firma (`exp`, `sig`), que la API sólo genera para quien
   * puede verlos. Sin límite de peticiones: por IP, una oficina que avanza por un vídeo (una
   * petición por tramo) agotaría el cupo de todos.
   */
  @Public()
  @SkipThrottle()
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
    reply.header('Content-Length', String(file.size));

    return reply.send(file.stream);
  }

  /**
   * Fragmento pedido con `Range` (saltar en un vídeo, reanudar una descarga), o `null` para
   * enviarlo entero. Con `If-Range` va entero: sin ETag ni Last-Modified no se sabe si el
   * fragmento es del mismo archivo.
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
    return {
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
      // Dentro de un <img> el SVG se ve igual; abierto directamente, no ejecuta lo que lleve dentro.
      ...(hasActiveContent(key) && {
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      }),
      'Content-Disposition': contentDisposition('inline', name),
      'Cache-Control': this.cacheControl(key),
    };
  }

  /** Ninguna caché compartida guarda lo reservado ni las fotos de perfil, que pueden retirarse. */
  private cacheControl(key: string): string {
    const scope = isBrandKey(key) ? 'public' : 'private';
    return `${scope}, max-age=${isPublicKey(key) ? PUBLIC_CACHE_S : RESERVED_CACHE_S}`;
  }
}
