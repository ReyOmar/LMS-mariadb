import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { FileOwnershipService } from '../storage/file-ownership.service';
import { RealtimeService } from '../realtime/realtime.service';
import { SettingsService } from '../settings/settings.service';
import { Country } from '../common/domain/country';
import { hashPassword, passwordMatches, validateStrength } from '../common/domain/password';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ACCOUNT_VIEW } from './account-view';

/**
 * La cuenta de quien tiene la sesión abierta: su perfil, su contraseña, su foto y la
 * autorización de tratamiento de datos. Las demás cuentas de la sede, que gestiona un
 * administrador, están en `UserService`.
 */
@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly realtime: RealtimeService,
    private readonly settings: SettingsService,
    private readonly files: FileOwnershipService,
  ) {}

  // ── Perfil ───────────────────────────────────────────────────────────────

  /** Perfil de quien tiene la sesión abierta, y si le falta aceptar la política de datos vigente. */
  async get(guid: string, country: Country) {
    const user = await this.prisma.user.findFirst({
      where: { guid, country },
      select: { ...ACCOUNT_VIEW, dataConsentVersion: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');

    const { dataConsentVersion, ...profile } = user;
    return { ...profile, consentRequired: dataConsentVersion !== (await this.settings.legalVersion(country)) };
  }

  /**
   * Registra que la persona acepta la política de datos vigente de su sede. La fecha y la
   * versión quedan como prueba de la autorización.
   */
  async acceptDataPolicy(guid: string, country: Country) {
    await this.prisma.user.update({
      where: { guid },
      data: { dataConsentAt: new Date(), dataConsentVersion: await this.settings.legalVersion(country) },
    });
    return { consentRequired: false };
  }

  /**
   * Actualiza nombre, apellido y contraseña del propio usuario.
   * Cambiar la contraseña cierra todas sus sesiones, también la actual, que el cliente
   * vuelve a abrir con la clave nueva: si alguien tenía la cuenta comprometida, queda fuera.
   */
  async update(guid: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { guid }, select: { password: true } });
    if (!user) throw new NotFoundException('Usuario no encontrado.');

    const data: Prisma.UserUpdateInput = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;

    const { newPassword } = dto;
    if (newPassword) {
      if (!dto.currentPassword) {
        throw new BadRequestException('Escribe tu contraseña actual para poder cambiarla.');
      }
      if (!(await passwordMatches(dto.currentPassword, user.password))) {
        throw new BadRequestException('La contraseña actual no es correcta.');
      }
      validateStrength(newPassword);
      data.password = await hashPassword(newPassword);
      data.usesDefaultPassword = false;
      data.currentSessionJti = null;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No hay ningún cambio que guardar.');
    }

    const updated = await this.prisma.user.update({ where: { guid }, data, select: ACCOUNT_VIEW });

    if (newPassword) this.realtime.revokeSession(guid, 'password_changed');
    this.notifyAccountChanged(guid, updated.country);

    return { message: 'Perfil actualizado correctamente.', user: updated };
  }

  // ── Foto ─────────────────────────────────────────────────────────────────

  /** Sustituye la foto de perfil y retira la anterior del almacenamiento. */
  async uploadPhoto(guid: string, filePath: string, originalName: string) {
    const user = await this.prisma.user.findUnique({ where: { guid }, select: { country: true } });
    if (!user) throw new NotFoundException('Usuario no encontrado.');

    const key = await this.storage.uploadFromDisk(filePath, originalName, 'avatars', {
      sub: guid,
      country: user.country,
    });
    await this.files.adoptUpload(
      key,
      () => this.swapPhoto(guid, key),
      (previousPhoto) => previousPhoto,
    );

    this.notifyAccountChanged(guid, user.country);
    return { message: 'Foto de perfil actualizada.', photoUrl: key };
  }

  /** Con la fila bloqueada, para que dos cambios a la vez no retiren la misma foto anterior y dejen otra sin dueño. */
  private swapPhoto(guid: string, photoUrl: string): Promise<string | null> {
    return this.prisma.$transaction(async (tx) => {
      const [current] = await tx.$queryRaw<{ photoUrl: string | null }[]>`
        SELECT foto_url AS photoUrl FROM usuarios WHERE guid = ${guid} FOR UPDATE`;
      await tx.user.update({ where: { guid }, data: { photoUrl } });
      return current?.photoUrl ?? null;
    });
  }

  /** Quita la foto de perfil y la retira del almacenamiento. */
  async deletePhoto(guid: string) {
    const user = await this.prisma.user.findUnique({
      where: { guid },
      select: { photoUrl: true, country: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    if (!user.photoUrl) throw new BadRequestException('No tienes foto de perfil.');

    const photo = { folder: 'avatars' as const, current: user.photoUrl, next: null };
    await this.files.replace([photo], { uploader: guid }, () =>
      this.prisma.user.update({ where: { guid }, data: { photoUrl: null } }),
    );

    this.notifyAccountChanged(guid, user.country);
    return { message: 'Foto de perfil eliminada.' };
  }

  /** La lista de cuentas de los administradores es la que enseña nombre, rol y foto. */
  private notifyAccountChanged(guid: string, country: Country): void {
    this.realtime.emitToRole('user:updated', { guid }, country, 'ADMIN');
  }
}
