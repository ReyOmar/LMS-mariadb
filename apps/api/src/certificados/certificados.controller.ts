import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply } from 'fastify';
import { CertificadosService } from './certificados.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { EmitirCertificadoDto } from './dto/emitir-certificado.dto';

@Controller('certificados')
export class CertificadosController {
  constructor(private readonly certificados: CertificadosService) {}

  /** Certificados del alumno en sesión. */
  @Get()
  getMisCertificados(@CurrentUser() user: JwtPayload) {
    return this.certificados.getMisCertificados(user);
  }

  /** Requisitos que faltan para obtener el certificado de un curso. */
  @Get('/finalizacion/:curso_guid')
  comprobarFinalizacion(@CurrentUser() user: JwtPayload, @Param('curso_guid') cursoGuid: string) {
    return this.certificados.comprobarFinalizacion(cursoGuid, user.sub);
  }

  /** Emite el certificado del alumno en sesión. Idempotente. */
  @Post('/emitir')
  emitir(@CurrentUser() user: JwtPayload, @Body() dto: EmitirCertificadoDto) {
    return this.certificados.emitirParaUsuario(dto.curso_guid, user);
  }

  /**
   * Verificación pública de autenticidad por código.
   * Es la única ruta abierta del módulo y devuelve datos mínimos.
   */
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Get('/verificar/:codigo')
  verificar(@Param('codigo') codigo: string) {
    return this.certificados.verificarPorCodigo(codigo);
  }

  @Get('/:guid')
  getCertificado(@CurrentUser() user: JwtPayload, @Param('guid') guid: string) {
    return this.certificados.getCertificado(guid, user);
  }

  /** Descarga del PDF. Comprueba la propiedad antes de servir el archivo. */
  @Get('/:guid/pdf')
  async descargarPdf(@CurrentUser() user: JwtPayload, @Param('guid') guid: string, @Res() reply: FastifyReply) {
    const { contenido, nombre } = await this.certificados.getPdf(guid, user);

    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="${nombre.replace(/"/g, '')}"`);
    reply.header('Cache-Control', 'private, no-store');
    return reply.send(contenido);
  }
}
