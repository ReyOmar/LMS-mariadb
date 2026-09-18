import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import * as path from 'path';
import { StorageService } from './storage.service';
import { leerArchivoDeLaPeticion } from './multipart';
import { Carpeta, esCarpeta, esClavePublica } from './storage.carpetas';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { ConfiguracionService } from '../configuracion/configuracion.service';

/** Carpetas donde puede escribir directamente quien gestiona contenido. */
const CARPETAS_DE_SUBIDA: Carpeta[] = ['portadas', 'recursos', 'firmas', 'logos', 'fondos'];

@Controller('storage')
export class StorageController {
  constructor(
    private readonly storage: StorageService,
    private readonly configuracion: ConfiguracionService,
  ) {}

  /**
   * Sube un archivo de contenido (portada de curso, material, firma, logotipo).
   * Las entregas de los alumnos no pasan por aquí: tienen su propio endpoint en
   * evaluaciones, que además comprueba la matrícula.
   */
  @Roles('ADMINISTRADOR', 'PROFESOR')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post('/upload')
  async uploadFile(@CurrentUser() user: JwtPayload, @Req() req: FastifyRequest, @Query('folder') carpeta?: string) {
    if (!esCarpeta(carpeta) || !CARPETAS_DE_SUBIDA.includes(carpeta)) {
      throw new BadRequestException(`Indica una carpeta válida: ${CARPETAS_DE_SUBIDA.join(', ')}.`);
    }
    if (carpeta === 'logos' || carpeta === 'fondos') {
      if (user.role !== 'ADMINISTRADOR') {
        throw new ForbiddenException('Sólo un administrador puede cambiar la identidad visual.');
      }
    }

    const archivo = await leerArchivoDeLaPeticion(req);
    const maxMb = await this.configuracion.getMaxArchivoMb(user.pais);
    const clave = await this.storage.uploadFromBuffer(archivo.contenido, archivo.nombre, carpeta, maxMb * 1024 * 1024);

    return { filename: clave, url: this.storage.urlDeDescarga(clave) };
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
    @Query('originalName') nombreOriginal?: string,
    @Query('exp') exp?: string,
    @Query('sig') sig?: string,
  ) {
    const clave = this.claveSegura((req.params as Record<string, string>)['*'] ?? '');

    if (!esClavePublica(clave) && !this.storage.firmaValida(clave, exp, sig)) {
      throw new ForbiddenException('El enlace de descarga no es válido o ha caducado. Vuelve a abrirlo desde la plataforma.');
    }

    // Con CDN configurado se redirige, salvo en los reservados: un CDN público anularía
    // la caducidad de la firma.
    const urlCdn = esClavePublica(clave) ? this.storage.urlPublicaDirecta(clave) : null;
    if (urlCdn) {
      return reply.redirect(urlCdn, 302);
    }

    const archivo = await this.storage.leer(clave);
    if (!archivo) throw new NotFoundException('Archivo no encontrado.');

    const nombreDescarga = this.nombreDeDescarga(clave, nombreOriginal);
    for (const [cabecera, valor] of Object.entries(this.cabecerasDeSeguridad(clave, archivo.contentType, nombreDescarga))) {
      reply.header(cabecera, valor);
    }

    return reply.send(archivo.contenido);
  }

  /**
   * Valida la ruta pedida: exactamente `carpeta/archivo`, con la carpeta en la lista
   * conocida y sin componentes que permitan salir del directorio.
   */
  private claveSegura(ruta: string): string {
    const partes = decodeURIComponent(ruta).split('/');
    if (partes.length !== 2 || !esCarpeta(partes[0])) {
      throw new BadRequestException('Ruta de archivo no válida.');
    }

    const nombre = path.basename(partes[1]);
    if (!nombre || nombre.startsWith('.')) {
      throw new BadRequestException('Ruta de archivo no válida.');
    }
    return `${partes[0]}/${nombre}`;
  }

  private nombreDeDescarga(clave: string, nombreOriginal?: string): string {
    const base = nombreOriginal ? path.basename(nombreOriginal) : path.basename(clave);
    // Se quitan comillas y saltos para no poder inyectar cabeceras adicionales.
    return base.replace(/["\r\n]/g, '').slice(0, 200) || 'archivo';
  }

  private cabecerasDeSeguridad(clave: string, contentType: string, nombre: string): Record<string, string> {
    const esSvg = path.extname(clave).toLowerCase() === '.svg';

    return {
      'Content-Type': contentType,
      // Impide que el navegador reinterprete el tipo del contenido.
      'X-Content-Type-Options': 'nosniff',
      // Un SVG se muestra bien dentro de <img> con esta política; si alguien navega
      // directamente a él, la CSP bloquea cualquier script que llevara dentro.
      ...(esSvg ? { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" } : {}),
      'Content-Disposition': `inline; filename="${nombre}"`,
      // Los archivos reservados no se cachean en intermediarios compartidos.
      'Cache-Control': esClavePublica(clave) ? 'public, max-age=86400' : 'private, max-age=300',
    };
  }
}
