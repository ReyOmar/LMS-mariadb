import { Controller, Get, Param, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply } from 'fastify';
import { CertificatesService } from './certificates.service';
import { contentDisposition } from '../storage/content-disposition';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  /** Certificados del alumno en sesión. */
  @Get()
  getMyCertificates(@CurrentUser() user: JwtPayload) {
    return this.certificates.getMyCertificates(user);
  }

  /** Cursos terminados cuyo certificado espera a que el examinador califique. */
  @Get('/awaiting-grading')
  coursesAwaitingGrading(@CurrentUser() user: JwtPayload) {
    return this.certificates.coursesAwaitingGrading(user.sub);
  }

  /**
   * Verificación pública de autenticidad por código.
   * Es la única ruta abierta del módulo y devuelve datos mínimos.
   */
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Get('/verify/:code')
  verify(@Param('code') code: string) {
    return this.certificates.verifyByCode(code);
  }

  /** Descarga del PDF. Comprueba la propiedad antes de servir el archivo. */
  @Get('/:guid/pdf')
  async downloadPdf(@CurrentUser() user: JwtPayload, @Param('guid') guid: string, @Res() reply: FastifyReply) {
    const { content, fileName } = await this.certificates.getPdf(guid, user);

    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', contentDisposition('attachment', fileName));
    reply.header('Cache-Control', 'private, no-store');
    return reply.send(content);
  }
}
