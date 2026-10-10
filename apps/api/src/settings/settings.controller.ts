import { Body, Controller, Get, Header, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { CountryPipe } from '../common/validation/country.pipe';
import { Country } from '../common/domain/country';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UpdateCertificateSettingsDto } from './dto/update-certificate-settings.dto';
import { UpdateSignatureDto } from './dto/update-signature.dto';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  // ── Público ──────────────────────────────────────────────────────────────
  // La portada y el login necesitan marca y textos antes de que exista sesión, así que
  // aquí —y sólo aquí— el país llega por query.

  /**
   * Marca y textos de la sede.
   *
   * `no-cache` —«guárdalo si quieres, pero pregunta siempre antes de usarlo»— porque esto
   * es lo que edita el panel de apariencia: con un `max-age`, tras guardar un color el panel
   * volvería a leer la versión anterior de la caché del navegador. No cuesta rendimiento: el
   * servicio guarda la configuración en memoria y la descarta al escribir.
   *
   * Tampoco puede ser `public`: la respuesta depende de la sede y no debe quedar en una
   * caché compartida delante del servidor.
   */
  @Public()
  @Get()
  @Header('Cache-Control', 'no-cache')
  getSettings(@Query('country', CountryPipe) country: Country) {
    return this.settings.getPublicSettings(country);
  }

  // ── Administración de la sede ────────────────────────────────────────────
  // El país sale de la sesión: un administrador sólo configura su propia sede.

  @Roles('ADMIN')
  @Post()
  updateSettings(@CurrentUser() user: JwtPayload, @Body() dto: UpdateSettingsDto) {
    return this.settings.updateSettings(user.country, dto);
  }

  /** Versiones publicadas de los textos legales: la prueba de lo que aceptó cada persona. */
  @Roles('ADMIN')
  @Get('/legal-versions')
  getLegalVersions(@CurrentUser() user: JwtPayload) {
    return this.settings.getLegalVersions(user.country);
  }

  @Roles('ADMIN')
  @Get('/legal-versions/:id')
  getLegalVersion(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.settings.getLegalVersion(id, user.country);
  }

  @Roles('ADMIN')
  @Get('/certificates')
  getCertificateSettings(@CurrentUser() user: JwtPayload) {
    return this.settings.getCertificateSettings(user.country);
  }

  @Roles('ADMIN')
  @Post('/certificates')
  updateCertificateSettings(@CurrentUser() user: JwtPayload, @Body() dto: UpdateCertificateSettingsDto) {
    return this.settings.updateCertificateSettings(user.country, dto);
  }

  // ── Firma del examinador ─────────────────────────────────────────────────

  /** Firma propia. Nunca acepta un GUID por query: sólo se lee la del usuario en sesión. */
  @Roles('ADMIN', 'TEACHER')
  @Get('/signature')
  getSignature(@CurrentUser() user: JwtPayload) {
    return this.settings.getSignature(user.sub);
  }

  @Roles('ADMIN', 'TEACHER')
  @Post('/signature')
  updateSignature(@CurrentUser() user: JwtPayload, @Body() dto: UpdateSignatureDto) {
    return this.settings.updateSignature(user.sub, dto);
  }

  @Roles('ADMIN')
  @Get('/signature/course/:courseGuid')
  getSignatureByCourse(@CurrentUser() user: JwtPayload, @Param('courseGuid') courseGuid: string) {
    return this.settings.getSignatureByCourse(courseGuid, user.country);
  }
}
