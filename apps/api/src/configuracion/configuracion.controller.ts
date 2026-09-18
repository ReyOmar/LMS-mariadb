import { Body, Controller, Get, Header, Param, Post, Query } from '@nestjs/common';
import { ConfiguracionService } from './configuracion.service';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { PaisQueryPipe } from '../common/dto/pais-query.pipe';
import { Pais } from '../common/domain/pais';
import { UpdateConfiguracionDto } from './dto/update-configuracion.dto';
import { UpdateCertConfigDto } from './dto/update-cert-config.dto';
import { UpdateFirmaDto } from './dto/update-firma.dto';

@Controller('configuracion')
export class ConfiguracionController {
  constructor(private readonly configuracion: ConfiguracionService) {}

  // ── Público ──────────────────────────────────────────────────────────────
  // La portada y el login necesitan marca y textos antes de que exista sesión, así que
  // aquí —y sólo aquí— el país llega por query.

  @Public()
  @Get()
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  getConfig(@Query('pais', PaisQueryPipe) pais: Pais) {
    return this.configuracion.getConfig(pais);
  }

  @Public()
  @Get('/landing')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  getLandingConfig(@Query('pais', PaisQueryPipe) pais: Pais) {
    return this.configuracion.getLandingConfig(pais);
  }

  // ── Administración de la sede ────────────────────────────────────────────
  // El país sale de la sesión: un administrador sólo configura su propia sede.

  @Roles('ADMINISTRADOR')
  @Get('/full')
  getFullConfig(@CurrentUser() user: JwtPayload) {
    return this.configuracion.getFullConfig(user.pais);
  }

  @Roles('ADMINISTRADOR')
  @Post()
  updateConfig(@CurrentUser() user: JwtPayload, @Body() dto: UpdateConfiguracionDto) {
    return this.configuracion.updateConfig(user.pais, dto);
  }

  @Roles('ADMINISTRADOR')
  @Get('/certificados')
  getCertConfig(@CurrentUser() user: JwtPayload) {
    return this.configuracion.getCertConfig(user.pais);
  }

  @Roles('ADMINISTRADOR')
  @Post('/certificados')
  updateCertConfig(@CurrentUser() user: JwtPayload, @Body() dto: UpdateCertConfigDto) {
    return this.configuracion.updateCertConfig(user.pais, dto);
  }

  // ── Firma del examinador ─────────────────────────────────────────────────

  /** Firma propia. Nunca acepta un GUID por query: sólo se lee la del usuario en sesión. */
  @Get('/firma')
  getFirma(@CurrentUser() user: JwtPayload) {
    return this.configuracion.getFirma(user.sub);
  }

  @Post('/firma')
  updateFirma(@CurrentUser() user: JwtPayload, @Body() dto: UpdateFirmaDto) {
    return this.configuracion.updateFirma(user.sub, dto);
  }

  /** Firma de otro examinador. Reservada al administrador y limitada a su sede. */
  @Roles('ADMINISTRADOR')
  @Get('/firma/usuario/:usuario_guid')
  getFirmaDeUsuario(@CurrentUser() user: JwtPayload, @Param('usuario_guid') usuarioGuid: string) {
    return this.configuracion.getFirma(usuarioGuid, user.pais);
  }

  @Roles('ADMINISTRADOR')
  @Get('/firma/curso/:curso_guid')
  getFirmaPorCurso(@CurrentUser() user: JwtPayload, @Param('curso_guid') cursoGuid: string) {
    return this.configuracion.getFirmaPorCurso(cursoGuid, user.pais);
  }
}
